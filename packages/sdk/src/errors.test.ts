import { describe, it, expect } from 'vitest';
import {
  PayVaultError,
  AuthenticationError,
  ValidationError,
  ProviderError,
  NetworkError,
  TransactionError,
} from './errors';

// ── PayVaultError (base class) ───────────────────────────────────

describe('PayVaultError', () => {
  it('sets message, code, provider, and name', () => {
    const err = new PayVaultError('something broke', {
      code: 'TEST_CODE',
      provider: 'paystack',
    });

    expect(err.message).toBe('something broke');
    expect(err.name).toBe('PayVaultError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.provider).toBe('paystack');
  });

  it('optionally sets statusCode and raw', () => {
    const raw = { detail: 'api response' };
    const err = new PayVaultError('fail', {
      code: 'X',
      provider: 'p',
      statusCode: 422,
      raw,
    });

    expect(err.statusCode).toBe(422);
    expect(err.raw).toBe(raw);
  });

  it('is an instance of Error', () => {
    const err = new PayVaultError('fail', { code: 'X', provider: 'p' });
    expect(err).toBeInstanceOf(Error);
  });
});

// ── AuthenticationError ──────────────────────────────────────────

describe('AuthenticationError', () => {
  it('auto-generates a descriptive message', () => {
    const err = new AuthenticationError('paystack');
    expect(err.message).toContain('paystack');
    expect(err.message).toContain('Authentication failed');
  });

  it('sets correct code and statusCode', () => {
    const err = new AuthenticationError('flutterwave', { raw: true });
    expect(err.code).toBe('AUTHENTICATION_ERROR');
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe('AuthenticationError');
    expect(err.raw).toEqual({ raw: true });
  });

  it('is an instance of PayVaultError and Error', () => {
    const err = new AuthenticationError('paystack');
    expect(err).toBeInstanceOf(PayVaultError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ── ValidationError ──────────────────────────────────────────────

describe('ValidationError', () => {
  it('sets message, field, and statusCode', () => {
    const err = new ValidationError('Email is required', 'paystack', 'email');
    expect(err.message).toBe('Email is required');
    expect(err.field).toBe('email');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
  });

  it('field is optional', () => {
    const err = new ValidationError('Bad input', 'paystack');
    expect(err.field).toBeUndefined();
  });

  it('is an instance of PayVaultError', () => {
    const err = new ValidationError('x', 'p');
    expect(err).toBeInstanceOf(PayVaultError);
  });
});

// ── ProviderError ────────────────────────────────────────────────

describe('ProviderError', () => {
  it('sets custom statusCode and raw data', () => {
    const raw = { errors: ['rate limited'] };
    const err = new ProviderError('Too many requests', 'paystack', 429, raw);

    expect(err.message).toBe('Too many requests');
    expect(err.statusCode).toBe(429);
    expect(err.raw).toBe(raw);
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.name).toBe('ProviderError');
  });

  it('is an instance of PayVaultError', () => {
    const err = new ProviderError('fail', 'p', 500);
    expect(err).toBeInstanceOf(PayVaultError);
  });
});

// ── NetworkError ─────────────────────────────────────────────────

describe('NetworkError', () => {
  it('includes the original error message', () => {
    const original = new Error('ECONNRESET');
    const err = new NetworkError('paystack', original);

    expect(err.message).toContain('ECONNRESET');
    expect(err.message).toContain('paystack');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.name).toBe('NetworkError');
  });

  it('handles missing original error gracefully', () => {
    const err = new NetworkError('flutterwave');
    expect(err.message).toContain('Connection failed');
  });

  it('is an instance of PayVaultError', () => {
    const err = new NetworkError('p');
    expect(err).toBeInstanceOf(PayVaultError);
  });
});

// ── TransactionError ─────────────────────────────────────────────

describe('TransactionError', () => {
  it('sets reference property', () => {
    const err = new TransactionError('Not found', 'paystack', 'pvt_abc123');
    expect(err.reference).toBe('pvt_abc123');
    expect(err.code).toBe('TRANSACTION_ERROR');
    expect(err.name).toBe('TransactionError');
  });

  it('reference is optional', () => {
    const err = new TransactionError('Error', 'paystack');
    expect(err.reference).toBeUndefined();
  });

  it('is an instance of PayVaultError', () => {
    const err = new TransactionError('x', 'p');
    expect(err).toBeInstanceOf(PayVaultError);
  });
});
