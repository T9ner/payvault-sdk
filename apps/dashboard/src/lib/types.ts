// ── Auth ────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  merchant: Merchant;
}

export interface Merchant {
  id: string;
  business_name: string;
  email: string;
  created_at: string;
}

// ── API Keys ────────────────────────────────────────────────
export interface APIKey {
  id: string;
  key_prefix: string;
  key: string; // full key only shown on creation
  created_at: string;
}

// ── Providers ───────────────────────────────────────────────
export interface ProviderCredentials {
  provider: "paystack" | "flutterwave";
  secret_key: string;
}

// ── Transactions ────────────────────────────────────────────
export interface Transaction {
  id: string;
  reference: string;
  merchant_id: string;
  provider: string;
  provider_ref?: string;
  mode: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  email: string;
  channel?: string;
  ip_address?: string;
  metadata?: Record<string, unknown>;
  authorization_url?: string;
  paid_at?: string;
  created_at: string;
  updated_at?: string;
}

export type TransactionStatus =
  | "pending"
  | "success"
  | "failed"
  | "refunded";

export interface ChargeRequest {
  amount: number;
  currency: string;
  email: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

export interface ChargeResponse {
  reference: string;
  authorization_url: string;
  provider: string;
}

export interface RefundRequest {
  reference: string;
  amount?: number;
}

// ── Payment Links ───────────────────────────────────────────
export interface PaymentLink {
  id: string;
  merchant_id: string;
  slug: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  active: boolean;
  created_at: string;
}

export interface CreatePaymentLinkRequest {
  name: string;
  description: string;
  amount: number;
  currency: string;
}

// ── Subscriptions & Plans ───────────────────────────────────
export interface Plan {
  id: string;
  merchant_id: string;
  name: string;
  amount: number;
  currency: string;
  interval: "daily" | "weekly" | "monthly" | "yearly";
  created_at: string;
}

export interface CreatePlanRequest {
  name: string;
  amount: number;
  currency: string;
  interval: string;
}

export interface Subscription {
  id: string;
  plan_id: string;
  customer_email: string;
  status: "active" | "cancelled" | "expired";
  current_period_end: string;
  created_at: string;
}

// ── Fraud ───────────────────────────────────────────────────
export interface FraudRule {
  id: string;
  merchant_id: string;
  rule_type: string;
  threshold: number;
  action: "flag" | "block";
  enabled: boolean;
  created_at: string;
}

export interface UpsertFraudRuleRequest {
  rule_type: string;
  threshold: number;
  action: "flag" | "block";
  enabled: boolean;
}

export interface FraudEvent {
  id: string;
  transaction_id: string;
  rule_type: string;
  risk_score: number;
  action_taken: string;
  details: Record<string, unknown>;
  created_at: string;
}

// ── Webhooks ────────────────────────────────────────────────
export interface WebhookLog {
  id: string;
  merchant_id: string;
  event_type: string;
  url: string;
  payload: Record<string, unknown>;
  response_code: number;
  response_body: string;
  attempts: number;
  last_attempt_at: string;
  status: "delivered" | "failed" | "pending";
  created_at: string;
}

// ── Status ──────────────────────────────────────────────────
export interface TransactionStatusResponse {
  reference: string;
  status: TransactionStatus;
  provider: string;
  amount: number;
  currency: string;
  updated_at: string;
}

export interface StatusTransition {
  id: string;
  reference: string;
  from_status: string;
  to_status: string;
  created_at: string;
}

// ── Pagination ──────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

// ── Dashboard Stats ─────────────────────────────────────────
export interface DashboardStats {
  total_volume: number;
  total_transactions: number;
  success_rate: number;
  active_links: number;
  recent_transactions: Transaction[];
}
