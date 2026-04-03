import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SquadProvider } from './squad';
import { ValidationError, PayVaultError } from '../errors';
import { HttpClient } from '../http';

// ── Setup ────────────────────────────────────────────────────────

let provider: SquadProvider;

beforeEach(() => {
  vi.restoreAllMocks();
  provider = new SquadProvider({
    provider: 'squad',
    secretKey: 'sandbox_test_secret_key_xyz',
    webhookSecret: 'whsec_squad_test',
    currency: 'NGN',
  });
});

/** Stub the provider's internal HttpClient methods */
function stubHttp(provider: any) {
  const http = provider.http as HttpClient;
  const get = vi.spyOn(http, 'get').mockResolvedValue({ status: 200, data: {}, headers: {} });
  const post = vi.spyOn(http, 'post').mockResolvedValue({ status: 200, data: {}, headers: {} });
  return { get, post };
}

// ── initializeTransaction ────────────────────────────────────────

describe('SquadProvider.initializeTransaction', () => {
  it('sends amount in kobo (× 100) and uses sandbox URL', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: { checkout_url: 'https://sandbox-api-d.squadco.com/checkout/abc', transaction_ref: 'pvt_sq_001' },
      },
      headers: {},
    });

    const result = await provider.initializeTransaction({
      amount: 5000,
      email: 'user@example.com',
    });

    expect(post).toHaveBeenCalledOnce();
    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('sandbox-api-d.squadco.com');
    expect(url).toContain('/transaction/initiate');
    // Squad uses kobo — multiply by 100
    expect(payload.amount).toBe(500000);
    expect(payload.email).toBe('user@example.com');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('squad');
    expect(result.authorizationUrl).toBe('https://sandbox-api-d.squadco.com/checkout/abc');
  });

  it('uses live URL for non-sandbox keys', async () => {
    const liveProvider = new SquadProvider({
      provider: 'squad',
      secretKey: 'live_secret_key_xyz',
    });
    const { post } = stubHttp(liveProvider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: { checkout_url: 'https://api-d.squadco.com/checkout/x' } },
      headers: {},
    });

    await liveProvider.initializeTransaction({ amount: 1000, email: 'a@b.com' });

    const [url] = post.mock.calls[0];
    expect(url).toContain('api-d.squadco.com');
    expect(url).not.toContain('sandbox');
  });

  it('throws ValidationError for missing email', async () => {
    await expect(
      provider.initializeTransaction({ amount: 5000, email: '' })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for zero amount', async () => {
    await expect(
      provider.initializeTransaction({ amount: 0, email: 'a@b.com' })
    ).rejects.toThrow(ValidationError);
  });
});

// ── verifyTransaction ────────────────────────────────────────────

describe('SquadProvider.verifyTransaction', () => {
  it('converts kobo to major units and maps success status', async () => {
    const { get } = stubHttp(provider);
    get.mockResolvedValueOnce({
      status: 200,
      data: {
        data: {
          transaction_status: 'success',
          transaction_ref: 'pvt_sq_001',
          amount: 500000, // kobo
          currency: 'NGN',
          payment_channel: 'card',
          email: 'user@example.com',
          customer_name: 'John Doe',
          paid_at: '2026-01-15T10:00:00Z',
        },
      },
      headers: {},
    });

    const result = await provider.verifyTransaction('pvt_sq_001');

    const [url] = get.mock.calls[0];
    expect(url).toContain('/transaction/verify/pvt_sq_001');

    expect(result.success).toBe(true);
    expect(result.status).toBe('success');
    expect(result.provider).toBe('squad');
    expect(result.amount).toBe(5000); // converted from kobo
    expect(result.currency).toBe('NGN');
    expect(result.channel).toBe('card');
    expect(result.customer.email).toBe('user@example.com');
    expect(result.customer.firstName).toBe('John');
    expect(result.customer.lastName).toBe('Doe');
  });

  it('maps failed status correctly', async () => {
    const { get } = stubHttp(provider);
    get.mockResolvedValueOnce({
      status: 200,
      data: { data: { transaction_status: 'failed', transaction_ref: 'ref', currency: 'NGN', amount: 100 } },
      headers: {},
    });

    const result = await provider.verifyTransaction('ref');
    expect(result.status).toBe('failed');
    expect(result.success).toBe(false);
  });

  it('throws ValidationError for empty reference', async () => {
    await expect(provider.verifyTransaction('')).rejects.toThrow(ValidationError);
  });
});

// ── refund ───────────────────────────────────────────────────────

describe('SquadProvider.refund', () => {
  it('POSTs to /transaction/refund and returns refundReference', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: { refund_ref: 'REFUND_sq_001', transaction_ref: 'pvt_sq_001' },
      },
      headers: {},
    });

    const result = await provider.refund({
      reference: 'pvt_sq_001',
      amount: 5000,
      reason: 'Customer request',
    });

    expect(post).toHaveBeenCalledOnce();
    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('/transaction/refund');
    expect(payload.gateway_transaction_ref).toBe('pvt_sq_001');
    expect(payload.reason_for_refund).toBe('Customer request');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('squad');
    expect(result.refundReference).toBe('REFUND_sq_001');
  });

  it('throws ValidationError for missing reference', async () => {
    await expect(
      provider.refund({ reference: '', amount: 100 })
    ).rejects.toThrow(ValidationError);
  });
});

// ── charge / submitAuthorization — unsupported ───────────────────

describe('SquadProvider — unsupported operations', () => {
  it('charge throws UNSUPPORTED_OPERATION', async () => {
    await expect(
      provider.charge({ amount: 5000, email: 'u@e.com', channel: 'card' })
    ).rejects.toThrow(PayVaultError);

    try {
      await provider.charge({ amount: 5000, email: 'u@e.com', channel: 'card' });
    } catch (e: any) {
      expect(e.code).toBe('UNSUPPORTED_OPERATION');
    }
  });

  it('submitAuthorization throws UNSUPPORTED_OPERATION', async () => {
    await expect(
      provider.submitAuthorization('ref', { type: 'otp', value: '123' })
    ).rejects.toThrow(PayVaultError);
  });
});

// ── verifyWebhook ────────────────────────────────────────────────

describe('SquadProvider.verifyWebhook', () => {
  it('returns true for valid HMAC-SHA512 using webhookSecret', async () => {
    const crypto = await import('crypto');
    const payload = '{"Event":"charge_successful","Body":{}}';
    const hash = crypto
      .createHmac('sha512', 'whsec_squad_test')
      .update(payload)
      .digest('hex');

    expect(provider.verifyWebhook(payload, hash)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(provider.verifyWebhook('{}', 'bad-sig')).toBe(false);
  });
});

// ── parseWebhook ─────────────────────────────────────────────────

describe('SquadProvider.parseWebhook', () => {
  it('parses Squad charge_successful webhook into unified WebhookEvent', () => {
    const webhookBody = JSON.stringify({
      Event: 'charge_successful',
      Body: {
        data: {
          transaction_ref: 'pvt_sq_001',
          transaction_status: 'success',
          amount: 500000, // kobo
          currency: 'NGN',
          email: 'user@example.com',
          customer_name: 'Jane Doe',
          created_at: '2026-01-15T10:00:00Z',
        },
      },
    });

    const event = provider.parseWebhook(webhookBody);

    expect(event.id).toBe('pvt_sq_001');
    expect(event.provider).toBe('squad');
    expect(event.type).toBe('charge_successful');
    expect(event.reference).toBe('pvt_sq_001');
    expect(event.status).toBe('success');
    expect(event.amount).toBe(5000); // kobo → major
    expect(event.currency).toBe('NGN');
    expect(event.customer.email).toBe('user@example.com');
    expect(event.customer.firstName).toBe('Jane');
    expect(event.customer.lastName).toBe('Doe');
    expect(event.timestamp).toBe('2026-01-15T10:00:00Z');
  });
});
