// Payment channels supported across providers
export type PaymentChannel = 'card' | 'bank_transfer' | 'ussd' | 'mobile_money' | 'qr' | 'apple_pay' | 'google_pay';

// Unified transaction status (the magic -- collapse 15+ provider states into 4)
export type TransactionStatus = 'success' | 'failed' | 'pending' | 'abandoned';

// Currency codes
export type Currency = 'NGN' | 'GHS' | 'KES' | 'ZAR' | 'USD' | 'GBP' | 'EUR' | string;

// Provider identifier
export type ProviderName = 'paystack' | 'flutterwave' | string;

// Core config for initializing PayVault
export interface PayVaultConfig {
  provider: ProviderName;
  secretKey: string;
  publicKey?: string;
  currency?: Currency;
  // Smart retry config
  retry?: {
    enabled?: boolean;        // default: true
    maxAttempts?: number;      // default: 3
    backoffMs?: number;        // default: 1000
    retryableStatuses?: number[]; // HTTP status codes to retry on
  };
  // Timeout config
  timeout?: number;            // default: 30000ms
  // Webhook secret for verification
  webhookSecret?: string;
  // Base URL override (for testing)
  baseUrl?: string;
  // Custom metadata attached to all transactions
  metadata?: Record<string, any>;
}

// Customer object
export interface Customer {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  metadata?: Record<string, any>;
}

// Transaction initialization config
export interface TransactionConfig {
  amount: number;              // In major currency units (e.g., 5000 = N5,000 NGN)
  email: string;
  currency?: Currency;
  reference?: string;          // Auto-generated if not provided
  channels?: PaymentChannel[]; // Restrict available channels
  callbackUrl?: string;
  metadata?: Record<string, any>;
  // Split payment
  split?: {
    subaccountCode: string;
    transactionCharge?: number;
    bearer?: 'account' | 'subaccount';
  };
  // Subscription
  plan?: string;
  // Customer details
  customer?: Omit<Customer, 'email'>;
}

// Unified transaction result
export interface TransactionResult {
  success: boolean;
  provider: ProviderName;
  authorizationUrl: string;    // Redirect user here
  accessCode: string;          // Provider's access code
  reference: string;           // Transaction reference
  raw: any;                    // Raw provider response
}

// Charge config (for direct card/bank charges)
export interface ChargeConfig {
  amount: number;
  email: string;
  currency?: Currency;
  reference?: string;
  authorizationCode?: string;  // For recurring charges
  channel: PaymentChannel;
  metadata?: Record<string, any>;
  // Card details (only for direct card charge -- use checkout URL flow when possible)
  card?: {
    number: string;
    expMonth: string;
    expYear: string;
    cvv: string;
    pin?: string;
  };
  // Bank details
  bank?: {
    code: string;
    accountNumber: string;
  };
}

// Charge result (may require further authorization)
export interface ChargeResult {
  success: boolean;
  status: TransactionStatus;
  provider: ProviderName;
  reference: string;
  // If further auth is needed
  requiresAuth: boolean;
  authType?: 'pin' | 'otp' | 'redirect' | 'phone' | 'birthday' | 'address' | 'none';
  authUrl?: string;            // For 3DS redirects
  authMessage?: string;        // Display message (e.g., "Enter OTP sent to 080****1234")
  raw: any;
}

// Verification result
export interface VerificationResult {
  success: boolean;
  status: TransactionStatus;
  provider: ProviderName;
  reference: string;
  amount: number;              // In major currency units
  currency: Currency;
  channel: PaymentChannel;
  paidAt: string | null;
  customer: Customer;
  // Card details (if card payment)
  authorization?: {
    code: string;              // For recurring charges
    last4: string;
    expMonth: string;
    expYear: string;
    cardType: string;
    bank: string;
    reusable: boolean;
    countryCode: string;
  };
  // Fees
  fees?: number;
  // Raw provider response
  raw: any;
}

// Refund config
export interface RefundConfig {
  reference: string;           // Original transaction reference
  amount?: number;             // Partial refund amount (major units). Full refund if omitted.
  reason?: string;
  metadata?: Record<string, any>;
}

// Refund result
export interface RefundResult {
  success: boolean;
  provider: ProviderName;
  refundReference: string;
  amount: number;
  currency: Currency;
  status: 'processed' | 'pending' | 'failed';
  raw: any;
}

// Subscription config
export interface SubscriptionConfig {
  planCode: string;
  email: string;
  startDate?: string;
  metadata?: Record<string, any>;
}

// Subscription result
export interface SubscriptionResult {
  success: boolean;
  provider: ProviderName;
  subscriptionCode: string;
  planCode: string;
  status: 'active' | 'paused' | 'cancelled' | 'pending';
  nextPaymentDate: string | null;
  raw: any;
}

// Webhook event (unified)
export interface WebhookEvent {
  id: string;
  provider: ProviderName;
  type: string;                // e.g., 'charge.success', 'transfer.success'
  reference: string;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  customer: Customer;
  timestamp: string;
  raw: any;                    // Original provider webhook payload
}

// Webhook handler function type
export type WebhookHandler = (event: WebhookEvent) => void | Promise<void>;

// Provider interface -- implement this to add a new payment provider
export interface Provider {
  name: ProviderName;

  // Initialize a transaction (redirect flow)
  initializeTransaction(config: TransactionConfig): Promise<TransactionResult>;

  // Verify a transaction
  verifyTransaction(reference: string): Promise<VerificationResult>;

  // Direct charge
  charge(config: ChargeConfig): Promise<ChargeResult>;

  // Submit authorization (OTP, PIN, etc.)
  submitAuthorization(reference: string, auth: { type: string; value: string }): Promise<ChargeResult>;

  // Refund
  refund(config: RefundConfig): Promise<RefundResult>;

  // Webhooks
  verifyWebhook(payload: string | Buffer, signature: string): boolean;
  parseWebhook(payload: string | Buffer): WebhookEvent;

  // Subscriptions (optional)
  createSubscription?(config: SubscriptionConfig): Promise<SubscriptionResult>;
  cancelSubscription?(code: string): Promise<{ success: boolean }>;
}
