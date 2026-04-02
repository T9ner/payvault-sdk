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
  // Single-subaccount split (simple case)
  split?: {
    subaccountCode: string;
    transactionCharge?: number;
    bearer?: 'account' | 'subaccount';
  };
  // Multi-recipient split (marketplace model) — use instead of `split` for multiple recipients
  multiSplit?: MultiSplitConfig;
  // Idempotency key — prevents duplicate charges on network retries
  idempotencyKey?: string;
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
  // Idempotency key — prevents duplicate charges on network retries
  idempotencyKey?: string;
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

// ── Bulk Transfers ────────────────────────────────────────────────────

/**
 * A single recipient in a bulk transfer.
 */
export interface BulkTransferRecipient {
  /** Bank account number */
  accountNumber: string;
  /** Bank code (e.g. "058" for GTBank, "063" for Access) */
  bankCode: string;
  /** Account holder name */
  accountName: string;
  /** Amount in MAJOR currency units (same convention as the rest of the SDK) */
  amount: number;
  /** Optional transfer description */
  narration?: string;
  /** Unique reference for this leg. Auto-generated (UUID) if not provided. */
  reference?: string;
  /** Currency. Defaults to the vault's configured currency. */
  currency?: Currency;
}

/**
 * Status of a single leg of a bulk transfer.
 */
export interface BulkTransferItem {
  reference: string;
  accountNumber: string;
  bankCode: string;
  accountName: string;
  amount: number;
  currency: string;
  narration?: string;
  status: 'success' | 'failed' | 'pending';
  failureReason?: string;
  providerReference?: string;
}

/**
 * Result from `vault.bulkTransfer()`.
 */
export interface BulkTransferResult {
  /** Batch ID assigned by the provider. */
  batchReference: string;
  /** Status of the batch. Providers may process asynchronously — use 'pending' when not immediately known. */
  status: 'success' | 'failed' | 'pending';
  /** Individual transfer outcomes. May be empty if the provider queues asynchronously. */
  items: BulkTransferItem[];
  /** Total number of transfers in the batch. */
  total: number;
  /** Number of successfully initiated transfers. */
  successCount: number;
  /** Number of failed transfers. */
  failedCount: number;
  /** Raw provider response for debugging. */
  rawResponse?: unknown;
}

/**
 * Configuration for bulk transfers.
 */
export interface BulkTransferConfig {
  /** List of recipients. Minimum 1, maximum 100. */
  recipients: BulkTransferRecipient[];
  /** Optional title / narration for the whole batch. */
  title?: string;
  /** Source of funds. Defaults to 'balance' (provider wallet). */
  source?: 'balance';
}

// ── Virtual Accounts ──────────────────────────────────────────────────────

/**
 * Configuration for creating a dedicated virtual bank account for a customer.
 * Payments made to this account number are auto-reconciled to the customer.
 */
export interface VirtualAccountConfig {
  /** Customer email address. */
  email: string;
  /** Bank Verification Number — required by all supported providers for identity verification. */
  bvn: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Currency. Defaults to the vault's configured currency. */
  currency?: Currency;
  /** Optional description shown on bank statements. */
  narration?: string;
  /** Optional idempotency reference. Auto-generated if not provided. */
  reference?: string;
}

/** Result from `vault.createVirtualAccount()`. */
export interface VirtualAccountResult {
  success: boolean;
  provider: ProviderName;
  /** The bank account number assigned to this customer. */
  accountNumber: string;
  /** Account name as registered at the bank. */
  accountName: string;
  /** Bank name (e.g. "Wema Bank", "Guaranty Trust Bank"). */
  bankName: string;
  reference: string;
  /** Expiry timestamp — null if the account is permanent. */
  expiresAt?: string | null;
  raw: any;
}

// ── Multi-Split Payments ───────────────────────────────────────────────────

/**
 * A single recipient in a multi-way payment split.
 */
export interface SplitRecipient {
  /** Provider subaccount code (Paystack) or subaccount ID (Flutterwave). */
  subaccountCode: string;
  /**
   * The recipient's share.
   * - `'percentage'`: 0–100 (e.g. 30 = 30% of the transaction amount)
   * - `'flat'`: exact amount in major currency units (same convention as `TransactionConfig.amount`)
   */
  share: number;
  shareType: 'percentage' | 'flat';
}

/**
 * Multi-recipient split configuration.
 * Pass this as `TransactionConfig.multiSplit` when splitting across more than one subaccount.
 * For a single subaccount, use the simpler `TransactionConfig.split` field.
 */
export interface MultiSplitConfig {
  recipients: SplitRecipient[];
  /**
   * Who bears the transaction fees.
   * - `'account'`          — Main account bears all fees (default)
   * - `'subaccount'`       — First listed subaccount bears fees
   * - `'all-proportional'` — Fees split proportionally (Paystack only)
   * - `'all'`              — Fees split equally (Paystack only)
   */
  bearer?: 'account' | 'subaccount' | 'all-proportional' | 'all';
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
  bulkTransfer?(config: BulkTransferConfig): Promise<BulkTransferResult>;
  // Virtual accounts (optional)
  createVirtualAccount?(config: VirtualAccountConfig): Promise<VirtualAccountResult>;
}
