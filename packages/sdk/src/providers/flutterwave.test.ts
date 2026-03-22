import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlutterwaveProvider } from './flutterwave';
import { ValidationError } from '../errors';
import { HttpClient } from '../http';

// ── Setup ────────────────────────────────────────────────────────

let provider: FlutterwaveProvider;

beforeEach(() => {
  vi.restoreAllMocks();
  provider = new FlutterwaveProvider({
    provider: 'flutterwave',
    secretKey: 'FLWSECK_TEST-xxx',
    webhookSecret: 'flw_webhook_secret',
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

describe('FlutterwaveProvider.initializeTransaction', () => {
  it('sends amount in major units (naira, NOT kobo)', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'success',
        data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc' },
      },
      headers: {},
    });

    const result = await provider.initializeTransaction({
      amount: 5000,
      email: 'user@example.com',
    });

    // Flutterwave uses major units — no kobo conversion
    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('/payments');
    expect(payload.amount).toBe(5000); // NOT 500000
    expect(payload.currency).toBe('NGN');
    expect(payload.customer.email).toBe('user@example.com');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('flutterwave');
    expect(result.authorizationUrl).toBe('https://checkout.flutterwave.com/v3/hosted/pay/abc');
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

describe('FlutterwaveProvider.verifyTransaction', () => {
  it('parses response — amount stays in major units', async () => {
    const { get } = stubHttp(provider);
    get.mockResolvedValueOnce({
      status: 200,
      data: {
        data: {
          status: 'successful',
          tx_ref: 'pvt_fw_001',
          amount: 5000,
          currency: 'NGN',
          payment_type: 'card',
          created_at: '2026-01-15T10:00:00Z',
          customer: {
            email: 'user@example.com',
            name: 'Jane Doe',
            phone_number: '08012345678',
          },
          card: {
            token: 'flw-t1-abc',
            last_4digits: '4081',
            expiry: '12/2030',
            type: 'VISA',
            issuer: 'Access Bank',
            country: 'NG',
          },
          app_fee: 75,
        },
      },
      headers: {},
    });

    const result = await provider.verifyTransaction('pvt_fw_001');

    const [url] = get.mock.calls[0];
    expect(url).toContain('tx_ref=pvt_fw_001');

    expect(result.amount).toBe(5000); // stays in major units
    expect(result.success).toBe(true);
    expect(result.status).toBe('success'); // "successful" → "success"
    expect(result.channel).toBe('card');
    expect(result.customer.firstName).toBe('Jane');
    expect(result.customer.lastName).toBe('Doe');
    expect(result.authorization?.code).toBe('flw-t1-abc');
    expect(result.authorization?.last4).toBe('4081');
    expect(result.authorization?.reusable).toBe(true);
    expect(result.fees).toBe(75);
  });

  it('throws ValidationError for empty reference', async () => {
    await expect(provider.verifyTransaction('')).rejects.toThrow(ValidationError);
  });
});

// ── charge ───────────────────────────────────────────────────────

describe('FlutterwaveProvider.charge', () => {
  it('sends tokenized recurring charge to /tokenized-charges', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'success',
        data: { status: 'successful', tx_ref: 'pvt_fw_chg_001' },
      },
      headers: {},
    });

    await provider.charge({
      amount: 3000,
      email: 'user@example.com',
      channel: 'card',
      authorizationCode: 'flw-t1-abc',
    });

    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('/tokenized-charges');
    expect(payload.token).toBe('flw-t1-abc');
    expect(payload.amount).toBe(3000); // major units
  });

  it('sends card charge with ?type=card query param', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'success',
        data: { status: 'pending', tx_ref: 'pvt_fw_chg_002' },
      },
      headers: {},
    });

    await provider.charge({
      amount: 2000,
      email: 'user@example.com',
      channel: 'card',
    });

    const [url] = post.mock.calls[0];
    expect(url).toContain('/charges');
    expect(url).toContain('type=card');
  });

  it('sends bank_transfer charge with ?type=bank_transfer', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { status: 'success', data: { status: 'pending' } },
      headers: {},
    });

    await provider.charge({
      amount: 2000,
      email: 'user@example.com',
      channel: 'bank_transfer',
    });

    const [url] = post.mock.calls[0];
    expect(url).toContain('type=bank_transfer');
  });
});

// ── verifyWebhook ────────────────────────────────────────────────

describe('FlutterwaveProvider.verifyWebhook', () => {
  it('returns true for valid HMAC-SHA256 base64 signature', async () => {
    const crypto = await import('crypto');
    const payload = '{"event":"charge.completed","data":{}}';
    const hash = crypto
      .createHmac('sha256', 'flw_webhook_secret')
      .update(payload)
      .digest('hex');
    const signature = Buffer.from(hash).toString('base64');

    expect(provider.verifyWebhook(payload, signature)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(provider.verifyWebhook('{}', 'bad-signature')).toBe(false);
  });

  it('returns false when no webhookSecret is configured', () => {
    const noSecretProvider = new FlutterwaveProvider({
      provider: 'flutterwave',
      secretKey: 'FLWSECK_TEST-xxx',
    });
    expect(noSecretProvider.verifyWebhook('{}', 'any-sig')).toBe(false);
  });
});

// ── parseWebhook ─────────────────────────────────────────────────

describe('FlutterwaveProvider.parseWebhook', () => {
  it('parses Flutterwave webhook into unified WebhookEvent', () => {
    const webhookBody = JSON.stringify({
      event: 'charge.completed',
      data: {
        id: 67890,
        status: 'successful',
        tx_ref: 'pvt_fw_001',
        amount: 5000,
        currency: 'NGN',
        customer: {
          email: 'user@example.com',
          name: 'Jane Doe',
          phone_number: '08012345678',
        },
      },
      timestamp: 1705320000,
    });

    const event = provider.parseWebhook(webhookBody);

    expect(event.id).toBe('67890');
    expect(event.provider).toBe('flutterwave');
    expect(event.type).toBe('charge.completed');
    expect(event.reference).toBe('pvt_fw_001');
    expect(event.status).toBe('success'); // "successful" → "success"
    expect(event.amount).toBe(5000);
    expect(event.customer.email).toBe('user@example.com');
    expect(event.customer.firstName).toBe('Jane');
    expect(event.customer.lastName).toBe('Doe');
  });
});
