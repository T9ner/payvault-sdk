import * as crypto from 'crypto';

// Generate a unique transaction reference
export function generateReference(prefix: string = 'pvt'): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

// Convert amount from major to minor units (e.g., NGN 5000 -> 500000 kobo)
export function toMinorUnits(amount: number, currency: string): number {
  const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND'];
  if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

// Convert amount from minor to major units (e.g., 500000 kobo -> NGN 5000)
export function toMajorUnits(amount: number, currency: string): number {
  const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND'];
  if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
    return amount;
  }
  return amount / 100;
}

// Map provider-specific status to unified status
export function normalizeStatus(providerStatus: string): 'success' | 'failed' | 'pending' | 'abandoned' {
  const statusMap: Record<string, 'success' | 'failed' | 'pending' | 'abandoned'> = {
    // Paystack statuses
    'success': 'success',
    'successful': 'success',
    'failed': 'failed',
    'pending': 'pending',
    'processing': 'pending',
    'ongoing': 'pending',
    'queued': 'pending',
    'abandoned': 'abandoned',
    'reversed': 'failed',
    // Flutterwave statuses
    'succeeded': 'success',
    'completed': 'success',
    'cancelled': 'abandoned',
    'error': 'failed',
  };
  return statusMap[providerStatus.toLowerCase()] || 'pending';
}

// Map provider channel names to unified channel names
export function normalizeChannel(providerChannel: string): string {
  const channelMap: Record<string, string> = {
    'card': 'card',
    'bank': 'bank_transfer',
    'bank_transfer': 'bank_transfer',
    'ussd': 'ussd',
    'mobile_money': 'mobile_money',
    'mobilemoney': 'mobile_money',
    'qr': 'qr',
    'apple_pay': 'apple_pay',
    'applepay': 'apple_pay',
    'google_pay': 'google_pay',
    'googlepay': 'google_pay',
    'eft': 'bank_transfer',
    'capitec_pay': 'bank_transfer',
    'payattitude': 'mobile_money',
    'opay': 'mobile_money',
  };
  return channelMap[providerChannel.toLowerCase()] || providerChannel;
}

// Sleep helper for retry backoff
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HMAC-SHA512 for Paystack webhook verification
export function hmacSha512(payload: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

// HMAC-SHA256 for Flutterwave webhook verification
export function hmacSha256(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Validate email format
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Deep merge objects.
// Source may contain keys that are not in target (e.g. merging a partial config).
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T> & Record<string, any>
): T {
  const result = { ...target } as T;
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      result[key as keyof T] = deepMerge(
        (result[key as keyof T] ?? {}) as Record<string, any>,
        sourceVal as Record<string, any>
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key as keyof T] = sourceVal as T[keyof T];
    }
  }
  return result;
}
