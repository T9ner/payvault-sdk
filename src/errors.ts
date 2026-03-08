export class PayVaultError extends Error {
  public code: string;
  public provider: string;
  public statusCode?: number;
  public raw?: any;

  constructor(message: string, options: {
    code: string;
    provider: string;
    statusCode?: number;
    raw?: any;
  }) {
    super(message);
    this.name = 'PayVaultError';
    this.code = options.code;
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.raw = options.raw;
  }
}

// Authentication errors (invalid API key, expired token)
export class AuthenticationError extends PayVaultError {
  constructor(provider: string, raw?: any) {
    super(`Authentication failed for ${provider}. Check your API keys.`, {
      code: 'AUTHENTICATION_ERROR',
      provider,
      statusCode: 401,
      raw,
    });
    this.name = 'AuthenticationError';
  }
}

// Validation errors (bad input)
export class ValidationError extends PayVaultError {
  public field?: string;

  constructor(message: string, provider: string, field?: string) {
    super(message, {
      code: 'VALIDATION_ERROR',
      provider,
      statusCode: 400,
    });
    this.name = 'ValidationError';
    this.field = field;
  }
}

// Provider API errors (rate limits, server errors)
export class ProviderError extends PayVaultError {
  constructor(message: string, provider: string, statusCode: number, raw?: any) {
    super(message, {
      code: 'PROVIDER_ERROR',
      provider,
      statusCode,
      raw,
    });
    this.name = 'ProviderError';
  }
}

// Network/timeout errors
export class NetworkError extends PayVaultError {
  constructor(provider: string, originalError?: Error) {
    super(`Network error communicating with ${provider}: ${originalError?.message || 'Connection failed'}`, {
      code: 'NETWORK_ERROR',
      provider,
      raw: originalError,
    });
    this.name = 'NetworkError';
  }
}

// Transaction-specific errors
export class TransactionError extends PayVaultError {
  public reference?: string;

  constructor(message: string, provider: string, reference?: string, raw?: any) {
    super(message, {
      code: 'TRANSACTION_ERROR',
      provider,
      raw,
    });
    this.name = 'TransactionError';
    this.reference = reference;
  }
}
