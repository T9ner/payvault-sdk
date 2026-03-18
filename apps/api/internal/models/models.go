package models

import (
	"time"

	"github.com/google/uuid"
)

// ── Merchants ────────────────────────────────────────────────────

type Merchant struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	BusinessName string    `json:"business_name"`
	BusinessURL  *string   `json:"business_url,omitempty"`
	Role         string    `json:"role"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type RegisterRequest struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	BusinessName string `json:"business_name"`
	BusinessURL  string `json:"business_url,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token    string    `json:"token"`
	Merchant *Merchant `json:"merchant"`
}

// ── API Keys ─────────────────────────────────────────────────────

type APIKey struct {
	ID          uuid.UUID  `json:"id"`
	MerchantID  uuid.UUID  `json:"merchant_id"`
	Prefix      string     `json:"prefix"`
	KeyHash     string     `json:"-"`
	LastFour    string     `json:"last_four"`
	Environment string     `json:"environment"`
	IsSecret    bool       `json:"is_secret"`
	IsActive    bool       `json:"is_active"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// APIKeyPair is returned when generating new keys.
type APIKeyPair struct {
	PublicKey  string `json:"public_key"`  // pk_live_xxxx or pk_test_xxxx
	SecretKey  string `json:"secret_key"`  // sk_live_xxxx or sk_test_xxxx (shown once)
}

// ── Merchant Providers ───────────────────────────────────────────

type MerchantProvider struct {
	ID              uuid.UUID `json:"id"`
	MerchantID      uuid.UUID `json:"merchant_id"`
	Provider        string    `json:"provider"`
	Environment     string    `json:"environment"`
	SecretKeyEnc    string    `json:"-"`
	PublicKey       *string   `json:"public_key,omitempty"`
	WebhookSecretEnc *string  `json:"-"`
	IsActive        bool      `json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type ProviderCredentialsRequest struct {
	Provider      string `json:"provider"`       // "paystack" or "flutterwave"
	Environment   string `json:"environment"`    // "test" or "live"
	SecretKey     string `json:"secret_key"`
	PublicKey     string `json:"public_key,omitempty"`
	WebhookSecret string `json:"webhook_secret,omitempty"`
}

// ── Merchant Settings ────────────────────────────────────────────

type MerchantSettings struct {
	ID              uuid.UUID `json:"id"`
	MerchantID      uuid.UUID `json:"merchant_id"`
	WebhookURL      *string   `json:"webhook_url,omitempty"`
	WebhookSecret   *string   `json:"-"`
	DefaultProvider string    `json:"default_provider"`
	DefaultCurrency string    `json:"default_currency"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type UpdateSettingsRequest struct {
	WebhookURL      *string `json:"webhook_url,omitempty"`
	DefaultProvider *string `json:"default_provider,omitempty"`
	DefaultCurrency *string `json:"default_currency,omitempty"`
}

// ── Transactions ─────────────────────────────────────────────────

type Transaction struct {
	ID               uuid.UUID  `json:"id"`
	MerchantID       uuid.UUID  `json:"merchant_id"`
	Reference        string     `json:"reference"`
	Provider         string     `json:"provider"`
	ProviderRef      *string    `json:"provider_ref,omitempty"`
	Environment      string     `json:"environment"`
	Status           string     `json:"status"`
	Amount           int64      `json:"amount"`
	Currency         string     `json:"currency"`
	Channel          *string    `json:"channel,omitempty"`
	Email            string     `json:"email"`
	IPAddress        *string    `json:"ip_address,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
	AuthorizationURL *string    `json:"authorization_url,omitempty"`
	PaidAt           *time.Time `json:"paid_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// ── Webhooks ─────────────────────────────────────────────────────

type Webhook struct {
	ID              uuid.UUID  `json:"id"`
	MerchantID      *uuid.UUID `json:"merchant_id,omitempty"`
	Provider        string     `json:"provider"`
	Environment     string     `json:"environment"`
	EventType       string     `json:"event_type"`
	IdempotencyKey  string     `json:"idempotency_key"`
	RawPayload      map[string]interface{} `json:"raw_payload"`
	NormalizedEvent map[string]interface{} `json:"normalized_event,omitempty"`
	ForwardStatus   string     `json:"forward_status"`
	ForwardAttempts int        `json:"forward_attempts"`
	LastForwardAt   *time.Time `json:"last_forward_at,omitempty"`
	LastError       *string    `json:"last_error,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

// ── Payment Links ────────────────────────────────────────────────

type PaymentLink struct {
	ID          uuid.UUID  `json:"id"`
	MerchantID  uuid.UUID  `json:"merchant_id"`
	Slug        string     `json:"slug"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	LinkType    string     `json:"link_type"`
	Amount      *int64     `json:"amount,omitempty"`
	Currency    string     `json:"currency"`
	RedirectURL *string    `json:"redirect_url,omitempty"`
	IsActive    bool       `json:"is_active"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	TotalPaid   int64      `json:"total_paid"`
	TotalCount  int        `json:"total_count"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// ── Subscriptions ────────────────────────────────────────────────

type Subscription struct {
	ID            uuid.UUID  `json:"id"`
	MerchantID    uuid.UUID  `json:"merchant_id"`
	Provider      string     `json:"provider"`
	ProviderCode  *string    `json:"provider_code,omitempty"`
	PlanCode      string     `json:"plan_code"`
	Email         string     `json:"email"`
	Status        string     `json:"status"`
	Amount        *int64     `json:"amount,omitempty"`
	Currency      *string    `json:"currency,omitempty"`
	NextPaymentAt *time.Time `json:"next_payment_at,omitempty"`
	CancelledAt   *time.Time `json:"cancelled_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// ── Refunds ──────────────────────────────────────────────────────

type Refund struct {
	ID            uuid.UUID `json:"id"`
	MerchantID    uuid.UUID `json:"merchant_id"`
	TransactionID uuid.UUID `json:"transaction_id"`
	Provider      string    `json:"provider"`
	ProviderRef   *string   `json:"provider_ref,omitempty"`
	Amount        int64     `json:"amount"`
	Currency      string    `json:"currency"`
	Reason        *string   `json:"reason,omitempty"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ── Fraud ────────────────────────────────────────────────────────

type FraudEvent struct {
	ID            uuid.UUID              `json:"id"`
	MerchantID    uuid.UUID              `json:"merchant_id"`
	TransactionID *uuid.UUID             `json:"transaction_id,omitempty"`
	RuleName      string                 `json:"rule_name"`
	RiskScore     float64                `json:"risk_score"`
	Action        string                 `json:"action"`
	Details       map[string]interface{} `json:"details,omitempty"`
	CreatedAt     time.Time              `json:"created_at"`
}

type FraudRule struct {
	ID         uuid.UUID              `json:"id"`
	MerchantID uuid.UUID              `json:"merchant_id"`
	RuleName   string                 `json:"rule_name"`
	IsEnabled  bool                   `json:"is_enabled"`
	Action     string                 `json:"action"`
	Config     map[string]interface{} `json:"config"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}

// ── Audit Log ────────────────────────────────────────────────────

type AuditEntry struct {
	ID           uuid.UUID              `json:"id"`
	MerchantID   *uuid.UUID             `json:"merchant_id,omitempty"`
	Actor        string                 `json:"actor"`
	Action       string                 `json:"action"`
	ResourceType string                 `json:"resource_type"`
	ResourceID   *uuid.UUID             `json:"resource_id,omitempty"`
	Changes      map[string]interface{} `json:"changes,omitempty"`
	IPAddress    *string                `json:"ip_address,omitempty"`
	CreatedAt    time.Time              `json:"created_at"`
}

// ── API Response Wrappers ────────────────────────────────────────

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type PaginatedResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Meta    *PaginationMeta `json:"meta"`
}

type PaginationMeta struct {
	Page       int   `json:"page"`
	PerPage    int   `json:"per_page"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}
