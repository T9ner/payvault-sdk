import { describe, it, expect } from 'vitest';
import {
  generateReference,
  toMinorUnits,
  toMajorUnits,
  normalizeStatus,
  normalizeChannel,
  isValidEmail,
  hmacSha512,
  hmacSha256,
  deepMerge,
} from './utils';

// ── generateReference ────────────────────────────────────────────

describe('generateReference', () => {
  it('returns a string with the default "pvt" prefix', () => {
    const ref = generateReference();
    expect(ref).toMatch(/^pvt_/);
  });

  it('uses a custom prefix when provided', () => {
    const ref = generateReference('custom');
    expect(ref).toMatch(/^custom_/);
  });

  it('generates unique references on consecutive calls', () => {
    const refs = new Set(Array.from({ length: 50 }, () => generateReference()));
    expect(refs.size).toBe(50);
  });
});

// ── toMinorUnits ─────────────────────────────────────────────────

describe('toMinorUnits', () => {
  it('converts NGN major to minor (naira → kobo)', () => {
    expect(toMinorUnits(5000, 'NGN')).toBe(500000);
  });

  it('converts 1 NGN to 100 kobo', () => {
    expect(toMinorUnits(1, 'NGN')).toBe(100);
  });

  it('handles decimal amounts (rounds to nearest)', () => {
    expect(toMinorUnits(99.99, 'USD')).toBe(9999);
  });

  it('leaves JPY unchanged (zero-decimal currency)', () => {
    expect(toMinorUnits(5000, 'JPY')).toBe(5000);
  });

  it('leaves KRW unchanged (zero-decimal currency)', () => {
    expect(toMinorUnits(50000, 'KRW')).toBe(50000);
  });

  it('leaves VND unchanged (zero-decimal currency)', () => {
    expect(toMinorUnits(100000, 'VND')).toBe(100000);
  });

  it('is case-insensitive for currency code', () => {
    expect(toMinorUnits(5000, 'jpy')).toBe(5000);
  });
});

// ── toMajorUnits ─────────────────────────────────────────────────

describe('toMajorUnits', () => {
  it('converts kobo → naira', () => {
    expect(toMajorUnits(500000, 'NGN')).toBe(5000);
  });

  it('converts 100 kobo to 1 NGN', () => {
    expect(toMajorUnits(100, 'NGN')).toBe(1);
  });

  it('leaves JPY unchanged (zero-decimal)', () => {
    expect(toMajorUnits(5000, 'JPY')).toBe(5000);
  });

  it('round-trips correctly: toMajorUnits(toMinorUnits(x)) === x', () => {
    const original = 12345.67;
    // Minor conversion rounds, so test with integer
    const intOriginal = 5000;
    expect(toMajorUnits(toMinorUnits(intOriginal, 'NGN'), 'NGN')).toBe(intOriginal);
  });
});

// ── normalizeStatus ──────────────────────────────────────────────

describe('normalizeStatus', () => {
  // Paystack statuses
  it('maps "success" → "success"', () => {
    expect(normalizeStatus('success')).toBe('success');
  });

  it('maps "reversed" → "failed"', () => {
    expect(normalizeStatus('reversed')).toBe('failed');
  });

  it('maps "abandoned" → "abandoned"', () => {
    expect(normalizeStatus('abandoned')).toBe('abandoned');
  });

  it('maps "processing" → "pending"', () => {
    expect(normalizeStatus('processing')).toBe('pending');
  });

  it('maps "ongoing" → "pending"', () => {
    expect(normalizeStatus('ongoing')).toBe('pending');
  });

  it('maps "queued" → "pending"', () => {
    expect(normalizeStatus('queued')).toBe('pending');
  });

  // Flutterwave statuses
  it('maps "successful" → "success"', () => {
    expect(normalizeStatus('successful')).toBe('success');
  });

  it('maps "completed" → "success"', () => {
    expect(normalizeStatus('completed')).toBe('success');
  });

  it('maps "cancelled" → "abandoned"', () => {
    expect(normalizeStatus('cancelled')).toBe('abandoned');
  });

  it('maps "error" → "failed"', () => {
    expect(normalizeStatus('error')).toBe('failed');
  });

  // Edge cases
  it('is case-insensitive', () => {
    expect(normalizeStatus('SUCCESS')).toBe('success');
    expect(normalizeStatus('Failed')).toBe('failed');
  });

  it('defaults unknown statuses to "pending"', () => {
    expect(normalizeStatus('some_unknown_status')).toBe('pending');
  });
});

// ── normalizeChannel ─────────────────────────────────────────────

describe('normalizeChannel', () => {
  it('maps "mobilemoney" → "mobile_money"', () => {
    expect(normalizeChannel('mobilemoney')).toBe('mobile_money');
  });

  it('maps "applepay" → "apple_pay"', () => {
    expect(normalizeChannel('applepay')).toBe('apple_pay');
  });

  it('maps "googlepay" → "google_pay"', () => {
    expect(normalizeChannel('googlepay')).toBe('google_pay');
  });

  it('maps "eft" → "bank_transfer"', () => {
    expect(normalizeChannel('eft')).toBe('bank_transfer');
  });

  it('maps "capitec_pay" → "bank_transfer"', () => {
    expect(normalizeChannel('capitec_pay')).toBe('bank_transfer');
  });

  it('maps "opay" → "mobile_money"', () => {
    expect(normalizeChannel('opay')).toBe('mobile_money');
  });

  it('passes through already-unified channel names', () => {
    expect(normalizeChannel('card')).toBe('card');
    expect(normalizeChannel('bank_transfer')).toBe('bank_transfer');
    expect(normalizeChannel('ussd')).toBe('ussd');
  });

  it('passes through unknown channel names unchanged', () => {
    expect(normalizeChannel('some_new_channel')).toBe('some_new_channel');
  });
});

// ── isValidEmail ─────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a.b+tag@sub.domain.co')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects strings with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

// ── deepMerge ────────────────────────────────────────────────────

describe('deepMerge', () => {
  it('merges flat objects', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('deeply merges nested objects', () => {
    const result = deepMerge(
      { config: { retry: true, timeout: 30 } },
      { config: { timeout: 60 } } as Record<string, any>
    );
    expect(result).toEqual({ config: { retry: true, timeout: 60 } });
  });

  it('does not mutate the original target', () => {
    const target = { a: 1 };
    const result = deepMerge(target, { b: 2 });
    expect(target).toEqual({ a: 1 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('does not overwrite with undefined', () => {
    const result = deepMerge({ a: 1 }, { a: undefined });
    expect(result.a).toBe(1);
  });

  it('replaces arrays instead of merging them', () => {
    const result = deepMerge({ items: [1, 2] }, { items: [3, 4] });
    expect(result.items).toEqual([3, 4]);
  });
});

// ── HMAC functions ───────────────────────────────────────────────

describe('hmacSha512', () => {
  it('produces a consistent hex digest', () => {
    const hash = hmacSha512('hello', 'secret');
    // SHA-512 hex is 128 characters
    expect(hash).toHaveLength(128);
    // Same input always gives same output
    expect(hmacSha512('hello', 'secret')).toBe(hash);
  });

  it('produces different digests for different payloads', () => {
    const hash1 = hmacSha512('payload1', 'secret');
    const hash2 = hmacSha512('payload2', 'secret');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different digests for different secrets', () => {
    const hash1 = hmacSha512('payload', 'secret1');
    const hash2 = hmacSha512('payload', 'secret2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('hmacSha256', () => {
  it('produces a consistent 64-char hex digest', () => {
    const hash = hmacSha256('hello', 'secret');
    // SHA-256 hex is 64 characters
    expect(hash).toHaveLength(64);
    expect(hmacSha256('hello', 'secret')).toBe(hash);
  });
});
