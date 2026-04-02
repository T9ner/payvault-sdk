package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TransactionService handles the core payment lifecycle:
// initiate -> verify -> (optional) refund
type TransactionService struct {
	db        *pgxpool.Pool
	providers *ProviderRegistry
	crypto    *CryptoService
	queue     interface {
		Enqueue(jobType string, payload []byte) error
	}
}

func NewTransactionService(db *pgxpool.Pool, providers *ProviderRegistry, crypto *CryptoService, queue interface {
	Enqueue(jobType string, payload []byte) error
}) *TransactionService {
	return &TransactionService{
		db:        db,
		providers: providers,
		crypto:    crypto,
		queue:     queue,
	}
}

// InitiateCharge creates a transaction record and calls the provider to get a payment URL.
func (s *TransactionService) InitiateCharge(ctx context.Context, merchantID string, input InitiateChargeInput) (*InitiateChargeOutput, error) {
	// 1. Resolve provider
	provider, err := s.providers.Get(input.Provider)
	if err != nil {
		return nil, fmt.Errorf("unsupported provider: %w", err)
	}

	// 2. Get merchant's decrypted secret key for this provider
	secretKey, err := s.getMerchantProviderKey(ctx, merchantID, input.Provider)
	if err != nil {
		return nil, fmt.Errorf("provider credentials not configured: %w", err)
	}

	// 3. Generate unique transaction reference
	ref := generateReference(input.Provider)

	// 4. Determine if this is live or test mode based on the API key used
	mode := "live"
	if isTestMode, ok := ctx.Value(ctxKeyTestMode).(bool); ok && isTestMode {
		mode = "test"
	}

	// 5. Insert transaction record (status: pending)
	var txnID string
	err = s.db.QueryRow(ctx, `
		INSERT INTO transactions (merchant_id, reference, provider, amount, currency, email, status, environment, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
		RETURNING id
	`, merchantID, ref, input.Provider, input.AmountKobo, input.Currency, input.Email, mode, input.Metadata).Scan(&txnID)
	if err != nil {
		return nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	// 6. Call provider to initiate charge
	providerCtx := WithSecretKey(ctx, secretKey)
	chargeResp, err := provider.InitiateCharge(providerCtx, ChargeRequest{
		Reference:   ref,
		AmountKobo:  input.AmountKobo,
		Currency:    input.Currency,
		Email:       input.Email,
		CallbackURL: input.CallbackURL,
		Metadata:    input.Metadata,
	})
	if err != nil {
		if _, err := s.db.Exec(ctx, `UPDATE transactions SET status = 'failed', failed_at = NOW(), updated_at = NOW() WHERE id = $1`, txnID); err != nil {
			fmt.Fprintf(os.Stderr, "[WARN] failed to mark transaction as failed: %v\n", err)
		}
		return nil, fmt.Errorf("provider charge failed: %w", err)
	}

	// 7. Update with provider reference
	if _, err := s.db.Exec(ctx, `
		UPDATE transactions SET provider_ref = $1, updated_at = NOW() WHERE id = $2
	`, chargeResp.ProviderRef, txnID); err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] failed to update transaction provider ref: %v\n", err)
	}

	// 8. Log to audit trail
	s.auditLog(ctx, merchantID, txnID, "transaction.initiated", fmt.Sprintf("provider=%s amount=%d%s", input.Provider, input.AmountKobo, input.Currency))

	return &InitiateChargeOutput{
		TransactionID: txnID,
		Reference:     ref,
		AuthURL:       chargeResp.AuthURL,
		Provider:      input.Provider,
		Status:        "pending",
	}, nil
}

// VerifyTransaction checks the transaction status with the provider and updates the record.
func (s *TransactionService) VerifyTransaction(ctx context.Context, merchantID, reference string) (*VerifyTransactionOutput, error) {
	// 1. Fetch transaction from DB
	var txnID, provider, status, providerRef string
	var amountKobo int64
	var currency string
	err := s.db.QueryRow(ctx, `
		SELECT id, provider, status, provider_ref, amount, currency
		FROM transactions WHERE merchant_id = $1 AND reference = $2
	`, merchantID, reference).Scan(&txnID, &provider, &status, &providerRef, &amountKobo, &currency)
	if err != nil {
		return nil, fmt.Errorf("transaction not found: %w", err)
	}

	// 2. If already in a final state, return cached result
	if status == "success" || status == "failed" {
		return &VerifyTransactionOutput{
			TransactionID: txnID,
			Reference:     reference,
			Provider:      provider,
			Status:        status,
			AmountKobo:    amountKobo,
			Currency:      currency,
		}, nil
	}

	// 3. Verify with provider
	p, err := s.providers.Get(provider)
	if err != nil {
		return nil, err
	}

	secretKey, err := s.getMerchantProviderKey(ctx, merchantID, provider)
	if err != nil {
		return nil, err
	}

	providerCtx := WithSecretKey(ctx, secretKey)
	verifyResp, err := p.VerifyTransaction(providerCtx, providerRef)
	if err != nil {
		return nil, fmt.Errorf("provider verification failed: %w", err)
	}

	// 4. Update transaction status
	paidAtClause := ""
	if verifyResp.Status == "success" {
		paidAtClause = ", paid_at = NOW()"
	} else if verifyResp.Status == "failed" {
		paidAtClause = ", failed_at = NOW()"
	}
	_, err = s.db.Exec(ctx, fmt.Sprintf(`
			UPDATE transactions SET status = $1, channel = $2, provider_response = $3%s, updated_at = NOW()
			WHERE id = $4
		`, paidAtClause), verifyResp.Status, verifyResp.Channel, verifyResp.RawResponse, txnID)
	if err != nil {
		return nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	// 5. If successful, enqueue webhook delivery to merchant
	if verifyResp.Status == "success" {
		s.auditLog(ctx, merchantID, txnID, "transaction.success", fmt.Sprintf("amount=%d%s channel=%s", verifyResp.AmountKobo, verifyResp.Currency, verifyResp.Channel))
		// Queue webhook notification to merchant
		s.enqueueWebhook(ctx, merchantID, txnID, "transaction.success")
	} else {
		s.auditLog(ctx, merchantID, txnID, "transaction."+verifyResp.Status, "")
	}

	return &VerifyTransactionOutput{
		TransactionID: txnID,
		Reference:     reference,
		Provider:      provider,
		Status:        verifyResp.Status,
		AmountKobo:    verifyResp.AmountKobo,
		Currency:      verifyResp.Currency,
		Channel:       verifyResp.Channel,
		PaidAt:        verifyResp.PaidAt,
	}, nil
}

// RefundTransaction processes a full or partial refund.
func (s *TransactionService) RefundTransaction(ctx context.Context, merchantID, reference string, amountKobo int64) (*RefundOutput, error) {
	// 1. Fetch original transaction
	var txnID, provider, status, providerRef string
	var originalAmount int64
	var currency string
	err := s.db.QueryRow(ctx, `
		SELECT id, provider, status, provider_ref, amount, currency
		FROM transactions WHERE merchant_id = $1 AND reference = $2
	`, merchantID, reference).Scan(&txnID, &provider, &status, &providerRef, &originalAmount, &currency)
	if err != nil {
		return nil, fmt.Errorf("transaction not found: %w", err)
	}

	// 2. Validate refund eligibility
	if status != "success" {
		return nil, fmt.Errorf("cannot refund transaction with status %q", status)
	}

	// Check existing refunds to prevent over-refunding
	var totalRefunded int64
	_ = s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM refunds
		WHERE transaction_id = $1 AND status != 'failed'
	`, txnID).Scan(&totalRefunded)

	refundAmount := amountKobo
	if refundAmount == 0 {
		refundAmount = originalAmount - totalRefunded // Full remaining refund
	}
	if totalRefunded+refundAmount > originalAmount {
		return nil, fmt.Errorf("refund amount (%d) exceeds refundable amount (%d)", refundAmount, originalAmount-totalRefunded)
	}

	// 3. Call provider
	p, err := s.providers.Get(provider)
	if err != nil {
		return nil, err
	}

	secretKey, err := s.getMerchantProviderKey(ctx, merchantID, provider)
	if err != nil {
		return nil, err
	}

	providerCtx := WithSecretKey(ctx, secretKey)
	refundResp, err := p.Refund(providerCtx, providerRef, refundAmount)
	if err != nil {
		return nil, fmt.Errorf("provider refund failed: %w", err)
	}

	// 4. Record refund
	var refundID string
	err = s.db.QueryRow(ctx, `
		INSERT INTO refunds (merchant_id, transaction_id, provider, provider_ref, amount, currency, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, merchantID, txnID, provider, refundResp.ProviderRef, refundAmount, currency, refundResp.Status).Scan(&refundID)
	if err != nil {
		return nil, fmt.Errorf("failed to record refund: %w", err)
	}

	// 5. If fully refunded, update transaction status
	if totalRefunded+refundAmount >= originalAmount {
		if _, err := s.db.Exec(ctx, `UPDATE transactions SET status = 'refunded', refunded_at = NOW(), updated_at = NOW() WHERE id = $1`, txnID); err != nil {
			fmt.Fprintf(os.Stderr, "[WARN] failed to mark transaction as refunded: %v\n", err)
		}
	}

	s.auditLog(ctx, merchantID, txnID, "transaction.refunded", fmt.Sprintf("refund_id=%s amount=%d%s", refundID, refundAmount, currency))
	s.enqueueWebhook(ctx, merchantID, txnID, "transaction.refunded")

	return &RefundOutput{
		RefundID:      refundID,
		TransactionID: txnID,
		AmountKobo:    refundAmount,
		Currency:      currency,
		Status:        refundResp.Status,
	}, nil
}

// ListTransactions returns paginated transactions for a merchant.
func (s *TransactionService) ListTransactions(ctx context.Context, merchantID string, limit, offset int) ([]TransactionSummary, int, error) {
	var total int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM transactions WHERE merchant_id = $1`, merchantID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, reference, provider, amount, currency, email, status, channel, environment, created_at
		FROM transactions WHERE merchant_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, merchantID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var txns []TransactionSummary
	for rows.Next() {
		var t TransactionSummary
		if err := rows.Scan(&t.ID, &t.Reference, &t.Provider, &t.AmountKobo, &t.Currency, &t.Email, &t.Status, &t.Channel, &t.Mode, &t.CreatedAt); err != nil {
			return nil, 0, err
		}
		txns = append(txns, t)
	}

	return txns, total, nil
}

// LookupMerchantByReference finds the merchant who owns a transaction by its reference.
func (s *TransactionService) LookupMerchantByReference(ctx context.Context, reference string, merchantID *string) error {
	return s.db.QueryRow(ctx, `
		SELECT merchant_id FROM transactions WHERE reference = $1 OR provider_ref = $1
	`, reference).Scan(merchantID)
}

// --- Helper methods ---

func (s *TransactionService) getMerchantProviderKey(ctx context.Context, merchantID, provider string) (string, error) {
	var encryptedKey string
	err := s.db.QueryRow(ctx, `
		SELECT encrypted_secret FROM provider_credentials
		WHERE merchant_id = $1 AND provider = $2
	`, merchantID, provider).Scan(&encryptedKey)
	if err != nil {
		return "", fmt.Errorf("no %s credentials found for merchant (save credentials in Settings first)", provider)
	}
	return s.crypto.Decrypt(encryptedKey)
}

func (s *TransactionService) auditLog(ctx context.Context, merchantID, resourceID, action, details string) {
	if _, err := s.db.Exec(ctx, `
		INSERT INTO audit_log (merchant_id, actor, action, resource_type, resource_id, changes)
		VALUES ($1, $2, $3, 'transaction', $4, $5)
	`, merchantID, "merchant:"+merchantID, action, resourceID, jsonbOrEmpty(map[string]interface{}{"msg": details})); err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] audit_log insert failed: %v\n", err)
	}
}

func (s *TransactionService) enqueueWebhook(ctx context.Context, merchantID, txnID, event string) {
	if s.queue != nil {
		payload := fmt.Sprintf(`{"merchant_id":%q,"transaction_id":%q,"event":%q}`, merchantID, txnID, event)
		_ = s.queue.Enqueue("webhook_delivery", []byte(payload))
	}
}

func generateReference(provider string) string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return fmt.Sprintf("pv_%s_%s_%d", provider[:2], hex.EncodeToString(b), time.Now().UnixMilli())
}

// --- Input/Output types ---

// contextKey type and ctxKeyTestMode are defined in helpers.go

type InitiateChargeInput struct {
	Provider    string                 `json:"provider" validate:"required,oneof=paystack flutterwave monnify squad"`
	AmountKobo  int64                  `json:"amount" validate:"required,gt=0"`
	Currency    string                 `json:"currency" validate:"required"`
	Email       string                 `json:"email" validate:"required,email"`
	CallbackURL string                 `json:"callback_url"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type InitiateChargeOutput struct {
	TransactionID string `json:"transaction_id"`
	Reference     string `json:"reference"`
	AuthURL       string `json:"authorization_url"`
	Provider      string `json:"provider"`
	Status        string `json:"status"`
}

type VerifyTransactionOutput struct {
	TransactionID string `json:"transaction_id"`
	Reference     string `json:"reference"`
	Provider      string `json:"provider"`
	Status        string `json:"status"`
	AmountKobo    int64  `json:"amount"`
	Currency      string `json:"currency"`
	Channel       string `json:"channel,omitempty"`
	PaidAt        string `json:"paid_at,omitempty"`
}

type RefundOutput struct {
	RefundID      string `json:"refund_id"`
	TransactionID string `json:"transaction_id"`
	AmountKobo    int64  `json:"amount"`
	Currency      string `json:"currency"`
	Status        string `json:"status"`
}

type TransactionSummary struct {
	ID         string    `json:"id"`
	Reference  string    `json:"reference"`
	Provider   string    `json:"provider"`
	AmountKobo int64     `json:"amount"`
	Currency   string    `json:"currency"`
	Email      string    `json:"customer_email"`
	Status     string    `json:"status"`
	Channel    *string   `json:"channel,omitempty"`
	Mode       string    `json:"mode"`
	CreatedAt  time.Time `json:"created_at"`
}
