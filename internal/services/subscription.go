package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SubscriptionService manages recurring billing through Paystack/Flutterwave plans.
// PayVault doesn't reinvent plan management -- it wraps provider plan APIs and tracks
// subscription state locally for unified querying and webhook-free status checks.
type SubscriptionService struct {
	db        *pgxpool.Pool
	providers *ProviderRegistry
	crypto    *CryptoService
}

func NewSubscriptionService(db *pgxpool.Pool, providers *ProviderRegistry, crypto *CryptoService) *SubscriptionService {
	return &SubscriptionService{db: db, providers: providers, crypto: crypto}
}

// ── Plan Management ──────────────────────────────────────────────
// Plans live on the provider side (Paystack/Flutterwave).
// We proxy the creation so merchants manage everything through PayVault.

type CreatePlanInput struct {
	Provider    string `json:"provider" validate:"required,oneof=paystack flutterwave"`
	Name        string `json:"name" validate:"required"`
	Amount      int64  `json:"amount" validate:"required,gt=0"` // In kobo
	Currency    string `json:"currency" validate:"required"`
	Interval    string `json:"interval" validate:"required,oneof=hourly daily weekly monthly quarterly annually"` // Billing cycle
	Description string `json:"description,omitempty"`
}

type PlanOutput struct {
	PlanCode    string `json:"plan_code"`    // Provider's plan identifier
	Provider    string `json:"provider"`
	Name        string `json:"name"`
	Amount      int64  `json:"amount"`
	Currency    string `json:"currency"`
	Interval    string `json:"interval"`
}

func (s *SubscriptionService) CreatePlan(ctx context.Context, merchantID string, input CreatePlanInput) (*PlanOutput, error) {
	provider, err := s.providers.Get(input.Provider)
	if err != nil {
		return nil, err
	}

	secretKey, err := s.getMerchantProviderKey(ctx, merchantID, input.Provider)
	if err != nil {
		return nil, fmt.Errorf("provider credentials not configured: %w", err)
	}

	providerCtx := WithSecretKey(ctx, secretKey)

	// Provider interface extension -- cast to SubscriptionProvider
	subProvider, ok := provider.(SubscriptionProvider)
	if !ok {
		return nil, fmt.Errorf("provider %s does not support subscriptions", input.Provider)
	}

	planResp, err := subProvider.CreatePlan(providerCtx, PlanRequest{
		Name:        input.Name,
		Amount:      input.Amount,
		Currency:    input.Currency,
		Interval:    input.Interval,
		Description: input.Description,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create plan: %w", err)
	}

	return &PlanOutput{
		PlanCode: planResp.PlanCode,
		Provider: input.Provider,
		Name:     input.Name,
		Amount:   input.Amount,
		Currency: input.Currency,
		Interval: input.Interval,
	}, nil
}

// ── Subscribe a Customer ─────────────────────────────────────────

type SubscribeInput struct {
	Provider string `json:"provider" validate:"required"`
	PlanCode string `json:"plan_code" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
}

type SubscribeOutput struct {
	SubscriptionID string `json:"subscription_id"`
	Provider       string `json:"provider"`
	PlanCode       string `json:"plan_code"`
	Email          string `json:"email"`
	Status         string `json:"status"`
	AuthURL        string `json:"authorization_url,omitempty"` // Some providers redirect for initial payment
}

func (s *SubscriptionService) Subscribe(ctx context.Context, merchantID string, input SubscribeInput) (*SubscribeOutput, error) {
	provider, err := s.providers.Get(input.Provider)
	if err != nil {
		return nil, err
	}

	secretKey, err := s.getMerchantProviderKey(ctx, merchantID, input.Provider)
	if err != nil {
		return nil, fmt.Errorf("provider credentials not configured: %w", err)
	}

	subProvider, ok := provider.(SubscriptionProvider)
	if !ok {
		return nil, fmt.Errorf("provider %s does not support subscriptions", input.Provider)
	}

	providerCtx := WithSecretKey(ctx, secretKey)
	subResp, err := subProvider.CreateSubscription(providerCtx, SubscriptionRequest{
		PlanCode: input.PlanCode,
		Email:    input.Email,
	})
	if err != nil {
		return nil, fmt.Errorf("subscription failed: %w", err)
	}

	// Store locally for unified querying
	var subID string
	err = s.db.QueryRow(ctx, `
		INSERT INTO subscriptions (merchant_id, provider, provider_code, plan_code, email, status, amount, currency)
		VALUES ($1, $2::provider_name, $3, $4, $5, 'pending'::subscription_status, $6, $7)
		RETURNING id
	`, merchantID, input.Provider, subResp.ProviderCode, input.PlanCode,
		input.Email, subResp.Amount, subResp.Currency,
	).Scan(&subID)
	if err != nil {
		return nil, fmt.Errorf("failed to record subscription: %w", err)
	}

	s.auditLog(ctx, merchantID, subID, "subscription.created", fmt.Sprintf("plan=%s email=%s", input.PlanCode, input.Email))

	return &SubscribeOutput{
		SubscriptionID: subID,
		Provider:       input.Provider,
		PlanCode:       input.PlanCode,
		Email:          input.Email,
		Status:         "pending",
		AuthURL:        subResp.AuthURL,
	}, nil
}

// ── Cancel Subscription ──────────────────────────────────────────

func (s *SubscriptionService) Cancel(ctx context.Context, merchantID, subscriptionID string) error {
	// Fetch local record
	var providerCode, provider string
	err := s.db.QueryRow(ctx, `
		SELECT provider_code, provider FROM subscriptions
		WHERE id = $1 AND merchant_id = $2 AND status = 'active'
	`, subscriptionID, merchantID).Scan(&providerCode, &provider)
	if err != nil {
		return fmt.Errorf("active subscription not found")
	}

	// Cancel with provider
	p, err := s.providers.Get(provider)
	if err != nil {
		return err
	}

	secretKey, err := s.getMerchantProviderKey(ctx, merchantID, provider)
	if err != nil {
		return err
	}

	subProvider, ok := p.(SubscriptionProvider)
	if !ok {
		return fmt.Errorf("provider %s does not support subscriptions", provider)
	}

	providerCtx := WithSecretKey(ctx, secretKey)
	if err := subProvider.CancelSubscription(providerCtx, providerCode); err != nil {
		return fmt.Errorf("failed to cancel with provider: %w", err)
	}

	// Update local record
	now := time.Now()
	_, err = s.db.Exec(ctx, `
		UPDATE subscriptions SET status = 'cancelled'::subscription_status, cancelled_at = $1, updated_at = NOW()
		WHERE id = $2
	`, now, subscriptionID)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	s.auditLog(ctx, merchantID, subscriptionID, "subscription.cancelled", "")
	return nil
}

// ── Sync from Provider Webhook ───────────────────────────────────
// Called when we receive a subscription event (charge, renewal, cancellation) from a provider webhook.

func (s *SubscriptionService) SyncFromWebhook(ctx context.Context, providerCode, newStatus string, nextPaymentAt *time.Time) error {
	_, err := s.db.Exec(ctx, `
		UPDATE subscriptions
		SET status = $1::subscription_status, next_payment_at = $2, updated_at = NOW()
		WHERE provider_code = $3
	`, newStatus, nextPaymentAt, providerCode)
	return err
}

// ── List Subscriptions ───────────────────────────────────────────

type SubscriptionSummary struct {
	ID            string     `json:"id"`
	Provider      string     `json:"provider"`
	PlanCode      string     `json:"plan_code"`
	Email         string     `json:"email"`
	Status        string     `json:"status"`
	Amount        *int64     `json:"amount,omitempty"`
	Currency      *string    `json:"currency,omitempty"`
	NextPaymentAt *time.Time `json:"next_payment_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

func (s *SubscriptionService) ListSubscriptions(ctx context.Context, merchantID string, limit, offset int) ([]SubscriptionSummary, int, error) {
	var total int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM subscriptions WHERE merchant_id = $1`, merchantID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, provider, plan_code, email, status, amount, currency, next_payment_at, created_at
		FROM subscriptions WHERE merchant_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, merchantID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var subs []SubscriptionSummary
	for rows.Next() {
		var sub SubscriptionSummary
		if err := rows.Scan(&sub.ID, &sub.Provider, &sub.PlanCode, &sub.Email, &sub.Status, &sub.Amount, &sub.Currency, &sub.NextPaymentAt, &sub.CreatedAt); err != nil {
			return nil, 0, err
		}
		subs = append(subs, sub)
	}

	return subs, total, nil
}

// ── Provider Interface Extension ─────────────────────────────────
// Providers that support recurring billing implement this interface.

type SubscriptionProvider interface {
	CreatePlan(ctx context.Context, req PlanRequest) (*PlanResponse, error)
	CreateSubscription(ctx context.Context, req SubscriptionRequest) (*SubscriptionResponse, error)
	CancelSubscription(ctx context.Context, providerCode string) error
}

type PlanRequest struct {
	Name        string
	Amount      int64
	Currency    string
	Interval    string // hourly, daily, weekly, monthly, quarterly, annually
	Description string
}

type PlanResponse struct {
	PlanCode string
}

type SubscriptionRequest struct {
	PlanCode string
	Email    string
}

type SubscriptionResponse struct {
	ProviderCode string
	AuthURL      string // Redirect for initial payment authorization
	Amount       int64
	Currency     string
}

// ── Helpers ──────────────────────────────────────────────────────

func (s *SubscriptionService) getMerchantProviderKey(ctx context.Context, merchantID, provider string) (string, error) {
	var encryptedKey string
	keyName := provider + "_secret_key"
	err := s.db.QueryRow(ctx, `
		SELECT credential_value FROM merchant_credentials
		WHERE merchant_id = $1 AND credential_key = $2
	`, merchantID, keyName).Scan(&encryptedKey)
	if err != nil {
		return "", fmt.Errorf("no %s credentials found for merchant", provider)
	}
	return s.crypto.Decrypt(encryptedKey)
}

func (s *SubscriptionService) auditLog(ctx context.Context, merchantID, resourceID, action, details string) {
	_, _ = s.db.Exec(ctx, `
		INSERT INTO audit_log (merchant_id, action, resource_type, resource_id, details)
		VALUES ($1, $2, 'subscription', $3, $4)
	`, merchantID, action, resourceID, details)
}
