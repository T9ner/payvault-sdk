import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonnifyProvider } from './monnify';
import { ValidationError, PayVaultError } from '../errors';
import { HttpClient } from '../http';

// ── Setup ────────────────────────────────────────────────────────

let provider: MonnifyProvider;

// Monnify credentials: apiKey|secretKey|contractCode
const TEST_SECRET = 'MK_TEST_abc123|monnify_secret_xyz|CTR_001';

beforeEach(() => {
  vi.restoreAllMocks();
  provider = new MonnifyProvider({
    provider: 'monnify',
    secretKey: TEST_SECRET,
    webhookSecret: 'whsec_monnify_test',
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

describe('MonnifyProvider.initializeTransaction', () => {
  it('fetches access token then POSTs to init-transaction', async () => {
    const { post } = stubHttp(provider);

    // First call: auth login
    post.mockResolvedValueOnce({
      status: 200,
      data: { responseBody: { accessToken: 'tok_test_abc' } },
      headers: {},
    });
    // Second call: init transaction
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        requestSuccessful: true,
        responseBody: { checkoutUrl: 'https://sandbox.monnify.com/checkout/abc', transactionReference: 'MNFY_ref_001' },
      },
      headers: {},
    });

    const result = await provider.initializeTransaction({
      amount: 5000,
      email: 'user@example.com',
    });

    expect(post).toHaveBeenCalledTimes(2);
    // First call should be the auth endpoint
    const [authUrl] = post.mock.calls[0];
    expect(authUrl).toContain('/v1/auth/login');
    // Second call should be the transaction endpoint
    const [txUrl, txPayload] = post.mock.calls[1];
    expect(txUrl).toContain('/v1/merchant/transactions/init-transaction');
    // Monnify uses major units, NOT kobo
    expect(txPayload.amount).toBe(5000);
    expect(txPayload.customerEmail).toBe('user@example.com');
    expect(txPayload.contractCode).toBe('CTR_001');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('monnify');
    expect(result.authorizationUrl).toBe('https://sandbox.monnify.com/checkout/abc');
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

describe('MonnifyProvider.verifyTransaction', () => {
  it('maps PAID status to success and returns correct shape', async () => {
    const { post, get } = stubHttp(provider);

    // Auth token
    post.mockResolvedValueOnce({
      status: 200,
      data: { responseBody: { accessToken: 'tok_test_abc' } },
      headers: {},
    });
    // Verify response
    get.mockResolvedValueOnce({
      status: 200,
      data: {
        responseBody: {
          paymentStatus: 'PAID',
          paymentReference: 'pvt_mn_001',
          amountPaid: 5000,
          currencyCode: 'NGN',
          customer: { email: 'user@example.com', name: 'John Doe' },
          paidOn: '2026-01-15T10:00:00Z',
        },
      },
      headers: {},
    });

    const result = await provider.verifyTransaction('pvt_mn_001');

    expect(result.success).toBe(true);
    expect(result.status).toBe('success');
    expect(result.provider).toBe('monnify');
    expect(result.amount).toBe(5000);
    expect(result.currency).toBe('NGN');
    expect(result.customer.email).toBe('user@example.com');
  });

  it('maps FAILED status to failed', async () => {
    const { post, get } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { responseBody: { accessToken: 'tok' } },
      headers: {},
    });
    get.mockResolvedValueOnce({
      status: 200,
      data: { responseBody: { paymentStatus: 'FAILED', paymentReference: 'ref', currencyCode: 'NGN' } },
      headers: {},
    });

    const result = await provider.verifyTransaction('ref');
    expect(result.status).toBe('failed');
    expect(result.success).toBe(false);
  });

  it('maps PENDING_PAYMENT status to pending', async () => {
    const { post, get } = stubHttp(provider);
    post.mockResolvedValueOnce({
      status: 200,
      data: { responseBody: { accessToken: 'tok' } },
      headers: {},
    });
    get.mockResolvedValueOnce({
      status: 200,
      data: { responseBody: { paymentStatus: 'PENDING_PAYMENT', paymentReference: 'ref', currencyCode: 'NGN' } },
      headers: {},
    });

    const result = await provider.verifyTransaction('ref');
    expect(result.status).toBe('pending');
  });

  it('throws ValidationError for empty reference', async () => {
    await expect(provider.verifyTransaction('')).rejects.toThrow(ValidationError);
  });
});

// ── charge / submitAuthorization / refund — unsupported ──────────

describe('MonnifyProvider — unsupported operations', () => {
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
      provider.submitAuthorization('ref', { type: 'otp', value: '123456' })
    ).rejects.toThrow(PayVaultError);
  });

  it('refund throws UNSUPPORTED_OPERATION', async () => {
    await expect(
      provider.refund({ reference: 'ref', amount: 100 })
    ).rejects.toThrow(PayVaultError);
  });
});

// ── verifyWebhook ────────────────────────────────────────────────

describe('MonnifyProvider.verifyWebhook', () => {
  it('uses webhookSecret when configured (takes priority over secretKey)', async () => {
    // provider has webhookSecret: 'whsec_monnify_test', so that's what gets used
    const crypto = await import('crypto');
    const payload = '{"eventType":"SUCCESSFUL_TRANSACTION","eventData":{}}';
    const hash = crypto
      .createHmac('sha512', 'whsec_monnify_test')
      .update(payload)
      .digest('hex');

    expect(provider.verifyWebhook(payload, hash)).toBe(true);
  });

  it('falls back to pipe-delimited secretKey when no webhookSecret configured', async () => {
    const crypto = await import('crypto');
    const noWebhookSecretProvider = new MonnifyProvider({
      provider: 'monnify',
      secretKey: TEST_SECRET, // apiKey|secretKey|contractCode
      // no webhookSecret set — falls back to secretKey from credentials
    });
    const payload = '{"eventType":"SUCCESSFUL_TRANSACTION","eventData":{}}';
    // Should use the secretKey segment from the pipe-delimited string
    const hash = crypto
      .createHmac('sha512', 'monnify_secret_xyz')
      .update(payload)
      .digest('hex');

    expect(noWebhookSecretProvider.verifyWebhook(payload, hash)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(provider.verifyWebhook('{}', 'bad-signature')).toBe(false);
  });
});

// ── parseWebhook ─────────────────────────────────────────────────

describe('MonnifyProvider.parseWebhook', () => {
  it('parses Monnify SUCCESSFUL_TRANSACTION webhook into unified WebhookEvent', () => {
    const webhookBody = JSON.stringify({
      eventType: 'SUCCESSFUL_TRANSACTION',
      eventData: {
        transactionReference: 'MNFY_tx_001',
        paymentReference: 'pvt_mn_001',
        paymentStatus: 'PAID',
        amountPaid: 5000,
        currency: 'NGN',
        customer: {
          email: 'user@example.com',
          name: 'Jane Doe',
        },
        paidOn: '2026-01-15T10:00:00Z',
      },
    });

    const event = provider.parseWebhook(webhookBody);

    expect(event.id).toBe('MNFY_tx_001');
    expect(event.provider).toBe('monnify');
    expect(event.type).toBe('SUCCESSFUL_TRANSACTION');
    expect(event.reference).toBe('pvt_mn_001');
    expect(event.status).toBe('success');
    expect(event.amount).toBe(5000);
    expect(event.currency).toBe('NGN');
    expect(event.customer.email).toBe('user@example.com');
    expect(event.customer.firstName).toBe('Jane');
    expect(event.timestamp).toBe('2026-01-15T10:00:00Z');
  });
});

// ── credential parsing ───────────────────────────────────────────

describe('MonnifyProvider — credential validation', () => {
  it('throws PayVaultError for invalid credential format', () => {
    expect(() => new MonnifyProvider({
      provider: 'monnify',
      secretKey: 'only_one_part',
    })).toThrow(PayVaultError);
  });

  it('throws PayVaultError for incomplete credentials', () => {
    expect(() => new MonnifyProvider({
      provider: 'monnify',
      secretKey: 'key1|key2', // missing contractCode
    })).toThrow(PayVaultError);
  });
});
