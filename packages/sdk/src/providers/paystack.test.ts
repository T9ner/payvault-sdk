import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaystackProvider } from './paystack';
import { ValidationError } from '../errors';
import { HttpClient } from '../http';

// ── Setup ────────────────────────────────────────────────────────

let provider: PaystackProvider;

beforeEach(() => {
  vi.restoreAllMocks();
  provider = new PaystackProvider({
    provider: 'paystack',
    secretKey: 'sk_test_xxx',
    webhookSecret: 'whsec_test',
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

describe('PaystackProvider.initializeTransaction', () => {
  it('sends correct payload with amount in kobo', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/abc',
          access_code: 'ACC_abc',
          reference: 'pvt_ps_001',
        },
      },
      headers: {},
    });

    const result = await provider.initializeTransaction({
      amount: 5000,
      email: 'user@example.com',
    });

    // Verify the POST was called with kobo amount
    expect(post).toHaveBeenCalledOnce();
    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('/transaction/initialize');
    expect(payload.amount).toBe(500000); // 5000 NGN → 500,000 kobo
    expect(payload.email).toBe('user@example.com');
    expect(payload.currency).toBe('NGN');

    // Verify parsed result
    expect(result.success).toBe(true);
    expect(result.provider).toBe('paystack');
    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc');
    expect(result.accessCode).toBe('ACC_abc');
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

  it('throws ValidationError for negative amount', async () => {
    await expect(
      provider.initializeTransaction({ amount: -100, email: 'a@b.com' })
    ).rejects.toThrow(ValidationError);
  });
});

// ── verifyTransaction ────────────────────────────────────────────

describe('PaystackProvider.verifyTransaction', () => {
  it('parses response — converts kobo to naira and normalizes status', async () => {
    const { get } = stubHttp(provider);
    get.mockResolvedValueOnce({
      status: 200,
      data: {
        data: {
          status: 'success',
          reference: 'pvt_ps_001',
          amount: 500000, // kobo
          currency: 'NGN',
          channel: 'card',
          paid_at: '2026-01-15T10:00:00Z',
          customer: {
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
          authorization: {
            authorization_code: 'AUTH_abc',
            last4: '4081',
            exp_month: '12',
            exp_year: '2030',
            card_type: 'visa',
            bank: 'Test Bank',
            reusable: true,
            country_code: 'NG',
          },
          fees: 7500, // 75 NGN in kobo
        },
      },
      headers: {},
    });

    const result = await provider.verifyTransaction('pvt_ps_001');

    expect(result.amount).toBe(5000); // converted from kobo
    expect(result.currency).toBe('NGN');
    expect(result.success).toBe(true);
    expect(result.status).toBe('success');
    expect(result.channel).toBe('card');
    expect(result.customer.email).toBe('user@example.com');
    expect(result.customer.firstName).toBe('John');
    expect(result.authorization?.code).toBe('AUTH_abc');
    expect(result.authorization?.last4).toBe('4081');
    expect(result.authorization?.reusable).toBe(true);
    expect(result.fees).toBe(75);
  });

  it('throws ValidationError for empty reference', async () => {
    await expect(provider.verifyTransaction('')).rejects.toThrow(ValidationError);
  });
});

// ── charge ───────────────────────────────────────────────────────

describe('PaystackProvider.charge', () => {
  it('sends recurring charge to /transaction/charge_authorization', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { data: { status: 'success', reference: 'pvt_ps_chg_001' } },
      headers: {},
    });

    await provider.charge({
      amount: 3000,
      email: 'user@example.com',
      channel: 'card',
      authorizationCode: 'AUTH_abc',
    });

    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('/transaction/charge_authorization');
    expect(payload.authorization_code).toBe('AUTH_abc');
    expect(payload.amount).toBe(300000); // kobo
  });

  it('sends direct charge to /charge endpoint', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { data: { status: 'pending', reference: 'pvt_ps_chg_002' } },
      headers: {},
    });

    await provider.charge({
      amount: 2000,
      email: 'user@example.com',
      channel: 'card',
    });

    const [url] = post.mock.calls[0];
    expect(url).toContain('/charge');
    expect(url).not.toContain('charge_authorization');
  });
});

// ── submitAuthorization ──────────────────────────────────────────

describe('PaystackProvider.submitAuthorization', () => {
  it('submits OTP to /charge/submit_otp', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { data: { status: 'success', reference: 'ref' } },
      headers: {},
    });

    await provider.submitAuthorization('ref', { type: 'otp', value: '123456' });

    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('/charge/submit_otp');
    expect(payload.otp).toBe('123456');
    expect(payload.reference).toBe('ref');
  });

  it('submits PIN to /charge/submit_pin', async () => {
    const { post } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { data: { status: 'success', reference: 'ref' } },
      headers: {},
    });

    await provider.submitAuthorization('ref', { type: 'pin', value: '1234' });

    const [url, payload] = post.mock.calls[0];
    expect(url).toContain('/charge/submit_pin');
    expect(payload.pin).toBe('1234');
  });

  it('throws ValidationError for unknown auth type', async () => {
    await expect(
      provider.submitAuthorization('ref', { type: 'magic', value: 'x' })
    ).rejects.toThrow(ValidationError);
  });
});

// ── verifyWebhook ────────────────────────────────────────────────

describe('PaystackProvider.verifyWebhook', () => {
  it('returns true for valid HMAC-SHA512 signature', async () => {
    const crypto = await import('crypto');
    const payload = '{"event":"charge.success","data":{}}';
    const hash = crypto
      .createHmac('sha512', 'whsec_test')
      .update(payload)
      .digest('hex');

    expect(provider.verifyWebhook(payload, hash)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(provider.verifyWebhook('{}', 'bad-signature')).toBe(false);
  });
});

// ── parseWebhook ─────────────────────────────────────────────────

describe('PaystackProvider.parseWebhook', () => {
  it('parses Paystack webhook into unified WebhookEvent', () => {
    const webhookBody = JSON.stringify({
      event: 'charge.success',
      data: {
        id: 12345,
        status: 'success',
        reference: 'pvt_ps_001',
        amount: 500000,
        currency: 'NGN',
        paid_at: '2026-01-15T10:00:00Z',
        customer: {
          email: 'user@example.com',
          first_name: 'Jane',
          last_name: 'Doe',
          phone: '08012345678',
        },
      },
    });

    const event = provider.parseWebhook(webhookBody);

    expect(event.id).toBe('12345');
    expect(event.provider).toBe('paystack');
    expect(event.type).toBe('charge.success');
    expect(event.reference).toBe('pvt_ps_001');
    expect(event.status).toBe('success');
    expect(event.amount).toBe(5000); // kobo → naira
    expect(event.currency).toBe('NGN');
    expect(event.customer.email).toBe('user@example.com');
    expect(event.customer.firstName).toBe('Jane');
    expect(event.timestamp).toBe('2026-01-15T10:00:00Z');
  });
});
