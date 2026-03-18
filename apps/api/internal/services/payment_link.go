package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PaymentLinkService handles shareable checkout URL lifecycle.
type PaymentLinkService struct {
	db       *pgxpool.Pool
	txnSvc   *TransactionService
	baseURL  string // e.g., "https://pay.payvault.co"
}

func NewPaymentLinkService(db *pgxpool.Pool, txnSvc *TransactionService, baseURL string) *PaymentLinkService {
	return &PaymentLinkService{db: db, txnSvc: txnSvc, baseURL: baseURL}
}

// ── Create ────────────────────────────────────────────────────────

type CreatePaymentLinkInput struct {
	Name        string                 `json:"name" validate:"required"`
	Description string                 `json:"description,omitempty"`
	LinkType    string                 `json:"link_type" validate:"required,oneof=fixed flexible"` // fixed = set amount, flexible = payer chooses
	Amount      *int64                 `json:"amount,omitempty"`  // Required if link_type=fixed (in kobo)
	Currency    string                 `json:"currency" validate:"required"`
	RedirectURL string                 `json:"redirect_url,omitempty"`
	ExpiresAt   *time.Time             `json:"expires_at,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type PaymentLinkOutput struct {
	ID          string                 `json:"id"`
	Slug        string                 `json:"slug"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	LinkType    string                 `json:"link_type"`
	Amount      *int64                 `json:"amount,omitempty"`
	Currency    string                 `json:"currency"`
	CheckoutURL string                 `json:"checkout_url"`
	RedirectURL string                 `json:"redirect_url,omitempty"`
	IsActive    bool                   `json:"is_active"`
	ExpiresAt   *time.Time             `json:"expires_at,omitempty"`
	TotalPaid   int64                  `json:"total_paid"`
	TotalCount  int                    `json:"total_count"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
}

func (s *PaymentLinkService) CreateLink(ctx context.Context, merchantID string, input CreatePaymentLinkInput) (*PaymentLinkOutput, error) {
	// Validate: fixed links must have an amount
	if input.LinkType == "fixed" && (input.Amount == nil || *input.Amount <= 0) {
		return nil, fmt.Errorf("amount is required for fixed payment links")
	}
	if input.LinkType == "" {
		input.LinkType = "fixed"
	}
	if input.Currency == "" {
		input.Currency = "NGN"
	}

	slug := generateSlug(input.Name)

	var id string
	var createdAt time.Time
	err := s.db.QueryRow(ctx, `
		INSERT INTO payment_links (merchant_id, slug, name, description, link_type, amount, currency, redirect_url, expires_at, metadata)
		VALUES ($1, $2, $3, $4, $5::link_type, $6, $7, $8, $9, $10)
		RETURNING id, created_at
	`, merchantID, slug, input.Name, nullStr(input.Description), input.LinkType,
		input.Amount, input.Currency, nullStr(input.RedirectURL), input.ExpiresAt, jsonbOrEmpty(input.Metadata),
	).Scan(&id, &createdAt)
	if err != nil {
		// Slug collision -- append random suffix
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			slug = slug + "-" + randomHex(3)
			err = s.db.QueryRow(ctx, `
				INSERT INTO payment_links (merchant_id, slug, name, description, link_type, amount, currency, redirect_url, expires_at, metadata)
				VALUES ($1, $2, $3, $4, $5::link_type, $6, $7, $8, $9, $10)
				RETURNING id, created_at
			`, merchantID, slug, input.Name, nullStr(input.Description), input.LinkType,
				input.Amount, input.Currency, nullStr(input.RedirectURL), input.ExpiresAt, jsonbOrEmpty(input.Metadata),
			).Scan(&id, &createdAt)
			if err != nil {
				return nil, fmt.Errorf("failed to create payment link: %w", err)
			}
		} else {
			return nil, fmt.Errorf("failed to create payment link: %w", err)
		}
	}

	return &PaymentLinkOutput{
		ID:          id,
		Slug:        slug,
		Name:        input.Name,
		Description: input.Description,
		LinkType:    input.LinkType,
		Amount:      input.Amount,
		Currency:    input.Currency,
		CheckoutURL: fmt.Sprintf("%s/%s", s.baseURL, slug),
		RedirectURL: input.RedirectURL,
		IsActive:    true,
		ExpiresAt:   input.ExpiresAt,
		TotalPaid:   0,
		TotalCount:  0,
		Metadata:    input.Metadata,
		CreatedAt:   createdAt,
	}, nil
}

// ── Get by Slug (public checkout) ─────────────────────────────────

func (s *PaymentLinkService) GetBySlug(ctx context.Context, slug string) (*PaymentLinkOutput, error) {
	var out PaymentLinkOutput
	var description, redirectURL *string
	err := s.db.QueryRow(ctx, `
		SELECT id, slug, name, description, link_type, amount, currency, redirect_url,
		       is_active, expires_at, total_paid, total_count, metadata, created_at
		FROM payment_links WHERE slug = $1
	`, slug).Scan(
		&out.ID, &out.Slug, &out.Name, &description, &out.LinkType, &out.Amount,
		&out.Currency, &redirectURL, &out.IsActive, &out.ExpiresAt,
		&out.TotalPaid, &out.TotalCount, &out.Metadata, &out.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("payment link not found")
	}

	// Check if link is usable
	if !out.IsActive {
		return nil, fmt.Errorf("payment link is inactive")
	}
	if out.ExpiresAt != nil && out.ExpiresAt.Before(time.Now()) {
		return nil, fmt.Errorf("payment link has expired")
	}

	if description != nil {
		out.Description = *description
	}
	if redirectURL != nil {
		out.RedirectURL = *redirectURL
	}
	out.CheckoutURL = fmt.Sprintf("%s/%s", s.baseURL, slug)

	return &out, nil
}

// ── Checkout: Initiate payment from a link ────────────────────────

type CheckoutInput struct {
	Email      string `json:"email" validate:"required,email"`
	Amount     *int64 `json:"amount,omitempty"` // Required if link is flexible
	Provider   string `json:"provider,omitempty"` // Optional -- defaults to merchant's default
}

type CheckoutOutput struct {
	TransactionID string `json:"transaction_id"`
	Reference     string `json:"reference"`
	AuthURL       string `json:"authorization_url"`
	Provider      string `json:"provider"`
}

func (s *PaymentLinkService) Checkout(ctx context.Context, slug string, input CheckoutInput) (*CheckoutOutput, error) {
	// 1. Fetch the link and validate
	var merchantID, linkID, linkType, currency string
	var fixedAmount *int64
	var redirectURL *string
	var isActive bool
	var expiresAt *time.Time

	err := s.db.QueryRow(ctx, `
		SELECT id, merchant_id, link_type, amount, currency, redirect_url, is_active, expires_at
		FROM payment_links WHERE slug = $1
	`, slug).Scan(&linkID, &merchantID, &linkType, &fixedAmount, &currency, &redirectURL, &isActive, &expiresAt)
	if err != nil {
		return nil, fmt.Errorf("payment link not found")
	}

	if !isActive {
		return nil, fmt.Errorf("payment link is inactive")
	}
	if expiresAt != nil && expiresAt.Before(time.Now()) {
		return nil, fmt.Errorf("payment link has expired")
	}

	// 2. Determine charge amount
	var chargeAmount int64
	switch linkType {
	case "fixed":
		if fixedAmount == nil {
			return nil, fmt.Errorf("payment link misconfigured: no amount set")
		}
		chargeAmount = *fixedAmount
	case "flexible":
		if input.Amount == nil || *input.Amount <= 0 {
			return nil, fmt.Errorf("amount is required for flexible payment links")
		}
		chargeAmount = *input.Amount
	default:
		return nil, fmt.Errorf("unknown link type: %s", linkType)
	}

	// 3. Resolve provider (use input, or fall back to merchant's default)
	provider := input.Provider
	if provider == "" {
		_ = s.db.QueryRow(ctx, `
			SELECT default_provider FROM merchant_settings WHERE merchant_id = $1
		`, merchantID).Scan(&provider)
		if provider == "" {
			provider = "paystack" // Sensible default for Nigerian merchants
		}
	}

	// 4. Build callback URL
	callbackURL := ""
	if redirectURL != nil {
		callbackURL = *redirectURL
	}

	// 5. Initiate charge through the transaction service
	chargeResult, err := s.txnSvc.InitiateCharge(ctx, merchantID, InitiateChargeInput{
		Provider:    provider,
		AmountKobo:  chargeAmount,
		Currency:    currency,
		Email:       input.Email,
		CallbackURL: callbackURL,
		Metadata: map[string]interface{}{
			"payment_link_id":   linkID,
			"payment_link_slug": slug,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("checkout failed: %w", err)
	}

	return &CheckoutOutput{
		TransactionID: chargeResult.TransactionID,
		Reference:     chargeResult.Reference,
		AuthURL:       chargeResult.AuthURL,
		Provider:      chargeResult.Provider,
	}, nil
}

// ── Record successful payment against a link ──────────────────────

func (s *PaymentLinkService) RecordPayment(ctx context.Context, linkID string, amount int64) error {
	_, err := s.db.Exec(ctx, `
		UPDATE payment_links
		SET total_paid = total_paid + $1, total_count = total_count + 1, updated_at = NOW()
		WHERE id = $2
	`, amount, linkID)
	return err
}

// ── List (merchant dashboard) ─────────────────────────────────────

func (s *PaymentLinkService) ListLinks(ctx context.Context, merchantID string, limit, offset int) ([]PaymentLinkOutput, int, error) {
	var total int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM payment_links WHERE merchant_id = $1`, merchantID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, slug, name, description, link_type, amount, currency, redirect_url,
		       is_active, expires_at, total_paid, total_count, metadata, created_at
		FROM payment_links WHERE merchant_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, merchantID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var links []PaymentLinkOutput
	for rows.Next() {
		var l PaymentLinkOutput
		var description, redirectURL *string
		if err := rows.Scan(
			&l.ID, &l.Slug, &l.Name, &description, &l.LinkType, &l.Amount,
			&l.Currency, &redirectURL, &l.IsActive, &l.ExpiresAt,
			&l.TotalPaid, &l.TotalCount, &l.Metadata, &l.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		if description != nil {
			l.Description = *description
		}
		if redirectURL != nil {
			l.RedirectURL = *redirectURL
		}
		l.CheckoutURL = fmt.Sprintf("%s/%s", s.baseURL, l.Slug)
		links = append(links, l)
	}

	return links, total, nil
}

// ── Deactivate ────────────────────────────────────────────────────

func (s *PaymentLinkService) DeactivateLink(ctx context.Context, merchantID, linkID string) error {
	result, err := s.db.Exec(ctx, `
		UPDATE payment_links SET is_active = false, updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2
	`, linkID, merchantID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("payment link not found")
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────

func generateSlug(name string) string {
	// Convert name to URL-safe slug + append random suffix for uniqueness
	slug := strings.ToLower(strings.TrimSpace(name))
	slug = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			return r
		}
		if r == ' ' || r == '-' || r == '_' {
			return '-'
		}
		return -1
	}, slug)
	// Collapse multiple dashes
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}
	slug = strings.Trim(slug, "-")
	if len(slug) > 30 {
		slug = slug[:30]
	}
	return slug + "-" + randomHex(4)
}

// randomHex is defined in helpers.go

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func jsonbOrEmpty(m map[string]interface{}) interface{} {
	if m == nil {
		return "{}"
	}
	return m
}
