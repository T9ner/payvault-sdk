import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayVault } from './client';
import { PayVaultError } from './errors';
import type {
  Provider,
  PayVaultConfig,
  TransactionResult,
  VerificationResult,
  ChargeResult,
  RefundResult,
  WebhookEvent,
} from './types';

// ── Mock Provider ────────────────────────────────────────────────
// A fake provider that records calls and returns canned responses.
// This lets us test PayVault's delegation logic without HTTP calls.

function createMockProvider(): Provider {
  return {
    name: 'mock',
    initializeTransaction: vi.fn().mockResolvedValue({
      success: true,
      provider: 'mock',
      authorizationUrl: 'https://mock.pay/checkout',
      accessCode: 'ACC_123',
      reference: 'pvt_mock_001',
      raw: {},
    } satisfies TransactionResult),

    verifyTransaction: vi.fn().mockResolvedValue({
      success: true,
      status: 'success',
      provider: 'mock',
      reference: 'pvt_mock_001',
      amount: 5000,
      currency: 'NGN',
      channel: 'card',
      paidAt: '2026-01-01T00:00:00Z',
      customer: { email: 'test@example.com' },
      raw: {},
    } satisfies VerificationResult),

    charge: vi.fn().mockResolvedValue({
      success: true,
      status: 'success',
      provider: 'mock',
      reference: 'pvt_mock_chg_001',
      requiresAuth: false,
      raw: {},
    } satisfies ChargeResult),

    submitAuthorization: vi.fn().mockResolvedValue({
      success: true,
      status: 'success',
      provider: 'mock',
      reference: 'pvt_mock_chg_001',
      requiresAuth: false,
      raw: {},
    } satisfies ChargeResult),

    refund: vi.fn().mockResolvedValue({
      success: true,
      provider: 'mock',
      refundReference: 'ref_001',
      amount: 5000,
      currency: 'NGN',
      status: 'processed',
      raw: {},
    } satisfies RefundResult),

    verifyWebhook: vi.fn().mockReturnValue(true),

    parseWebhook: vi.fn().mockReturnValue({
      id: 'evt_001',
      provider: 'mock',
      type: 'charge.success',
      reference: 'pvt_mock_001',
      status: 'success',
      amount: 5000,
      currency: 'NGN',
      customer: { email: 'test@example.com' },
      timestamp: '2026-01-01T00:00:00Z',
      raw: {},
    } satisfies WebhookEvent),
  };
}

// ── Setup ────────────────────────────────────────────────────────

// Register the mock provider before tests so PayVault can find it
beforeEach(() => {
  const MockClass = class implements Provider {
    name = 'mock' as const;
    private mock = createMockProvider();
    initializeTransaction = this.mock.initializeTransaction;
    verifyTransaction = this.mock.verifyTransaction;
    charge = this.mock.charge;
    submitAuthorization = this.mock.submitAuthorization;
    refund = this.mock.refund;
    verifyWebhook = this.mock.verifyWebhook;
    parseWebhook = this.mock.parseWebhook;
    // Intentionally NOT implementing createSubscription / cancelSubscription
    // so we can test the "not supported" path.
    constructor(_config: PayVaultConfig) {}
  };

  PayVault.registerProvider('mock', MockClass);
});

// ── Factory Methods ──────────────────────────────────────────────

describe('PayVault factory methods', () => {
  it('PayVault.paystack() creates a paystack instance', () => {
    const vault = PayVault.paystack('sk_test_xxx');
    expect(vault.providerName).toBe('paystack');
  });

  it('PayVault.flutterwave() creates a flutterwave instance', () => {
    const vault = PayVault.flutterwave('FLWSECK_TEST-xxx');
    expect(vault.providerName).toBe('flutterwave');
  });

  it('throws PayVaultError for unknown provider', () => {
    expect(() => new PayVault({ provider: 'stripe', secretKey: 'xxx' }))
      .toThrow(PayVaultError);

    try {
      new PayVault({ provider: 'stripe', secretKey: 'xxx' });
    } catch (e: any) {
      expect(e.code).toBe('INVALID_PROVIDER');
      expect(e.message).toContain('stripe');
    }
  });
});

// ── Custom Provider Registration ─────────────────────────────────

describe('registerProvider', () => {
  it('allows using a custom registered provider', () => {
    const vault = new PayVault({ provider: 'mock', secretKey: 'test' });
    expect(vault.providerName).toBe('mock');
  });
});

// ── Transaction Delegation ───────────────────────────────────────

describe('PayVault transaction methods', () => {
  let vault: PayVault;

  beforeEach(() => {
    vault = new PayVault({ provider: 'mock', secretKey: 'test' });
  });

  it('initializeTransaction delegates to the provider', async () => {
    const config = { amount: 5000, email: 'test@example.com' };
    const result = await vault.initializeTransaction(config);
    expect(result.success).toBe(true);
    expect(result.authorizationUrl).toBe('https://mock.pay/checkout');
    expect(result.reference).toBe('pvt_mock_001');
  });

  it('verifyTransaction delegates to the provider', async () => {
    const result = await vault.verifyTransaction('pvt_mock_001');
    expect(result.success).toBe(true);
    expect(result.amount).toBe(5000);
    expect(result.status).toBe('success');
  });

  it('charge delegates to the provider', async () => {
    const result = await vault.charge({
      amount: 5000,
      email: 'test@example.com',
      channel: 'card',
    });
    expect(result.success).toBe(true);
    expect(result.requiresAuth).toBe(false);
  });

  it('refund delegates to the provider', async () => {
    const result = await vault.refund({ reference: 'pvt_mock_001' });
    expect(result.success).toBe(true);
    expect(result.status).toBe('processed');
  });
});

// ── Subscription (not supported by mock) ─────────────────────────

describe('PayVault subscriptions (unsupported provider)', () => {
  let vault: PayVault;

  beforeEach(() => {
    vault = new PayVault({ provider: 'mock', secretKey: 'test' });
  });

  it('createSubscription throws NOT_SUPPORTED', async () => {
    await expect(
      vault.createSubscription({ planCode: 'PLN_123', email: 'test@example.com' })
    ).rejects.toThrow(PayVaultError);

    try {
      await vault.createSubscription({ planCode: 'PLN_123', email: 'test@example.com' });
    } catch (e: any) {
      expect(e.code).toBe('NOT_SUPPORTED');
    }
  });

  it('cancelSubscription throws NOT_SUPPORTED', async () => {
    await expect(
      vault.cancelSubscription('SUB_123')
    ).rejects.toThrow(PayVaultError);

    try {
      await vault.cancelSubscription('SUB_123');
    } catch (e: any) {
      expect(e.code).toBe('NOT_SUPPORTED');
    }
  });
});

// ── Webhook Handling ─────────────────────────────────────────────

describe('PayVault webhook handling', () => {
  let vault: PayVault;

  beforeEach(() => {
    vault = new PayVault({ provider: 'mock', secretKey: 'test' });
  });

  it('on() registers handlers and handleWebhook() dispatches to them', async () => {
    const handler = vi.fn();
    vault.on('charge.success', handler);

    const event = await vault.handleWebhook('{"test": true}', 'valid-sig');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
    expect(event.type).toBe('charge.success');
  });

  it('wildcard handler (*) receives all events', async () => {
    const wildcard = vi.fn();
    vault.on('*', wildcard);

    await vault.handleWebhook('{}', 'sig');
    expect(wildcard).toHaveBeenCalledOnce();
  });

  it('dispatches to both specific and wildcard handlers', async () => {
    const specific = vi.fn();
    const wildcard = vi.fn();
    vault.on('charge.success', specific);
    vault.on('*', wildcard);

    await vault.handleWebhook('{}', 'sig');
    expect(specific).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledOnce();
  });

  it('throws when webhook signature is invalid', async () => {
    // Make verifyWebhook return false
    const vault2 = new PayVault({ provider: 'mock', secretKey: 'test' });
    // We need to reach the provider's verifyWebhook, which is mocked to return true.
    // Let's register a provider that returns false:
    const RejectingProvider = class implements Provider {
      name = 'rejector' as const;
      initializeTransaction = vi.fn();
      verifyTransaction = vi.fn();
      charge = vi.fn();
      submitAuthorization = vi.fn();
      refund = vi.fn();
      verifyWebhook = vi.fn().mockReturnValue(false);
      parseWebhook = vi.fn();
      constructor(_config: PayVaultConfig) {}
    };
    PayVault.registerProvider('rejector', RejectingProvider);

    const rejectVault = new PayVault({ provider: 'rejector', secretKey: 'test' });

    await expect(
      rejectVault.handleWebhook('{}', 'bad-sig')
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('does not call handlers when no handlers match the event type', async () => {
    const handler = vi.fn();
    vault.on('transfer.success', handler); // Different event type

    await vault.handleWebhook('{}', 'sig');
    // handler should NOT be called because the mock returns type 'charge.success'
    expect(handler).not.toHaveBeenCalled();
  });
});

// ── pollVerification ─────────────────────────────────────────────

describe('PayVault.pollVerification', () => {
  let vault: PayVault;

  beforeEach(() => {
    vault = new PayVault({ provider: 'mock', secretKey: 'test' });
    // Use fake timers to avoid real waits during tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when the first verify returns success', async () => {
    // verifyTransaction is already mocked to return status: 'success'
    const poll = vault.pollVerification('pvt_mock_001', { maxWaitMs: 5000 });
    // Flush any pending timers
    await vi.runAllTimersAsync();
    const result = await poll;

    expect(result.success).toBe(true);
    expect(result.status).toBe('success');
    // verifyTransaction should have been called exactly once
    const provider = (vault as any).provider;
    expect(provider.verifyTransaction).toHaveBeenCalledOnce();
  });

  it('retries on pending status, resolves on second success', async () => {
    const provider = (vault as any).provider;

    // First call: pending, second call: success
    (provider.verifyTransaction as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        success: false,
        status: 'pending',
        provider: 'mock',
        reference: 'pvt_mock_001',
        amount: 5000,
        currency: 'NGN',
        channel: 'card',
        paidAt: null,
        customer: { email: 'test@example.com' },
        raw: {},
      })
      .mockResolvedValueOnce({
        success: true,
        status: 'success',
        provider: 'mock',
        reference: 'pvt_mock_001',
        amount: 5000,
        currency: 'NGN',
        channel: 'card',
        paidAt: '2026-01-01T00:00:00Z',
        customer: { email: 'test@example.com' },
        raw: {},
      });

    const onPoll = vi.fn();
    const poll = vault.pollVerification('pvt_mock_001', {
      intervalMs: 100,
      maxWaitMs: 10000,
      onPoll,
    });
    await vi.runAllTimersAsync();
    const result = await poll;

    expect(result.status).toBe('success');
    expect(provider.verifyTransaction).toHaveBeenCalledTimes(2);
    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(onPoll).toHaveBeenNthCalledWith(1, 1, 'pending');
    expect(onPoll).toHaveBeenNthCalledWith(2, 2, 'success');
  });

  it('throws PayVaultError with POLLING_TIMEOUT when maxWaitMs is exceeded', async () => {
    const provider = (vault as any).provider;
    const startTime = Date.now();

    // Track how many times verify has been called to advance time on first call
    let callCount = 0;
    (provider.verifyTransaction as ReturnType<typeof vi.fn>)
      .mockImplementation(async () => {
        callCount++;
        // After the first poll, advance the fake system clock past maxWaitMs
        if (callCount === 1) {
          vi.setSystemTime(startTime + 200); // 200ms > maxWaitMs of 50ms
        }
        return {
          success: false,
          status: 'pending',
          provider: 'mock',
          reference: 'pvt_mock_001',
          amount: 5000,
          currency: 'NGN',
          channel: 'card',
          paidAt: null,
          customer: { email: 'test@example.com' },
          raw: {},
        };
      });

    const poll = vault.pollVerification('pvt_mock_001', {
      intervalMs: 1000,
      maxWaitMs: 50,
    });

    // Advance all fake timers so sleep() resolves and the loop runs its check
    await vi.runAllTimersAsync();

    await expect(poll).rejects.toThrow(PayVaultError);
    try {
      await poll;
    } catch (e: any) {
      expect(e.code).toBe('POLLING_TIMEOUT');
      expect(e.message).toContain('timed out');
    }
  });
});
