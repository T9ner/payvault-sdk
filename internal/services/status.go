package services

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// StatusService provides a webhook-free developer experience layer.
// Instead of forcing merchants to implement webhook endpoints, they can:
//   1. Poll for transaction status updates
//   2. Long-poll for real-time status changes (blocks up to 30s)
//   3. List recent status transitions for a merchant
//
// This drastically simplifies integration for smaller merchants who
// just want to check "did the payment go through?" without infrastructure.
type StatusService struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

func NewStatusService(db *pgxpool.Pool, redisClient *redis.Client) *StatusService {
	return &StatusService{db: db, redis: redisClient}
}

// ── Status Check (Instant) ───────────────────────────────────────

// TransactionStatus represents the current state of a transaction.
type TransactionStatus struct {
	Reference   string     `json:"reference"`
	Status      string     `json:"status"`       // pending, success, failed, refunded
	Amount      int64      `json:"amount"`        // in smallest currency unit
	Currency    string     `json:"currency"`
	Provider    string     `json:"provider"`
	Channel     string     `json:"channel,omitempty"` // card, bank_transfer, ussd, etc.
	PaidAt      *time.Time `json:"paid_at,omitempty"`
	FailedAt    *time.Time `json:"failed_at,omitempty"`
	RefundedAt  *time.Time `json:"refunded_at,omitempty"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// GetStatus returns the current status of a transaction by reference.
// This is the simplest integration path -- just poll this endpoint.
func (s *StatusService) GetStatus(ctx context.Context, merchantID uuid.UUID, reference string) (*TransactionStatus, error) {
	var ts TransactionStatus
	var paidAt, failedAt, refundedAt *time.Time

	err := s.db.QueryRow(ctx, `
		SELECT reference, status, amount, currency, provider, channel,
		       paid_at, failed_at, refunded_at, updated_at
		FROM transactions
		WHERE merchant_id = $1 AND reference = $2
	`, merchantID, reference).Scan(
		&ts.Reference, &ts.Status, &ts.Amount, &ts.Currency,
		&ts.Provider, &ts.Channel,
		&paidAt, &failedAt, &refundedAt, &ts.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("transaction not found: %w", err)
	}

	ts.PaidAt = paidAt
	ts.FailedAt = failedAt
	ts.RefundedAt = refundedAt

	return &ts, nil
}

// ── Long-Poll (Wait for Change) ──────────────────────────────────

// WaitForStatus blocks until the transaction reaches a terminal state
// (success, failed, refunded) or the timeout is reached.
// Uses Redis pub/sub so the response is near-instant when status changes.
//
// Timeout: max 30 seconds. If the status hasn't changed, returns the
// current status with a "timeout" flag so the client knows to retry.
func (s *StatusService) WaitForStatus(ctx context.Context, merchantID uuid.UUID, reference string, timeout time.Duration) (*TransactionStatus, bool, error) {
	// Cap timeout at 30s
	if timeout > 30*time.Second {
		timeout = 30 * time.Second
	}

	// Check current status first -- if already terminal, return immediately
	current, err := s.GetStatus(ctx, merchantID, reference)
	if err != nil {
		return nil, false, err
	}
	if isTerminal(current.Status) {
		return current, false, nil
	}

	// Subscribe to status changes via Redis pub/sub
	channel := fmt.Sprintf("payvault:txn_status:%s", reference)
	sub := s.redis.Subscribe(ctx, channel)
	defer sub.Close()

	// Wait for a message or timeout
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ch := sub.Channel()
	select {
	case <-ch:
		// Status changed -- fetch fresh from DB
		updated, err := s.GetStatus(ctx, merchantID, reference)
		if err != nil {
			return current, false, err
		}
		return updated, false, nil

	case <-timeoutCtx.Done():
		// Timeout -- return current status with timedOut=true
		latest, err := s.GetStatus(ctx, merchantID, reference)
		if err != nil {
			return current, true, nil
		}
		return latest, true, nil
	}
}

// NotifyStatusChange publishes a status change event to Redis pub/sub.
// Called by TransactionService when a transaction status changes.
func (s *StatusService) NotifyStatusChange(ctx context.Context, reference string) error {
	channel := fmt.Sprintf("payvault:txn_status:%s", reference)
	return s.redis.Publish(ctx, channel, "changed").Err()
}

// ── Batch Status ─────────────────────────────────────────────────

// GetBatchStatus returns status for multiple transactions at once.
// Useful for checkout flows where the merchant initiated several charges
// and wants to check all of them in one call.
func (s *StatusService) GetBatchStatus(ctx context.Context, merchantID uuid.UUID, references []string) ([]TransactionStatus, error) {
	if len(references) == 0 {
		return nil, nil
	}
	if len(references) > 100 {
		return nil, fmt.Errorf("max 100 references per batch request")
	}

	rows, err := s.db.Query(ctx, `
		SELECT reference, status, amount, currency, provider, channel,
		       paid_at, failed_at, refunded_at, updated_at
		FROM transactions
		WHERE merchant_id = $1 AND reference = ANY($2)
		ORDER BY created_at DESC
	`, merchantID, references)
	if err != nil {
		return nil, fmt.Errorf("batch status query failed: %w", err)
	}
	defer rows.Close()

	var results []TransactionStatus
	for rows.Next() {
		var ts TransactionStatus
		var paidAt, failedAt, refundedAt *time.Time

		if err := rows.Scan(
			&ts.Reference, &ts.Status, &ts.Amount, &ts.Currency,
			&ts.Provider, &ts.Channel,
			&paidAt, &failedAt, &refundedAt, &ts.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan error: %w", err)
		}

		ts.PaidAt = paidAt
		ts.FailedAt = failedAt
		ts.RefundedAt = refundedAt
		results = append(results, ts)
	}

	return results, nil
}

// ── Recent Activity ──────────────────────────────────────────────

// RecentTransitions returns the last N status changes for a merchant,
// acting as a lightweight activity feed without webhook infrastructure.
func (s *StatusService) RecentTransitions(ctx context.Context, merchantID uuid.UUID, limit int) ([]TransactionStatus, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := s.db.Query(ctx, `
		SELECT reference, status, amount, currency, provider, channel,
		       paid_at, failed_at, refunded_at, updated_at
		FROM transactions
		WHERE merchant_id = $1
		ORDER BY updated_at DESC
		LIMIT $2
	`, merchantID, limit)
	if err != nil {
		return nil, fmt.Errorf("recent transitions query failed: %w", err)
	}
	defer rows.Close()

	var results []TransactionStatus
	for rows.Next() {
		var ts TransactionStatus
		var paidAt, failedAt, refundedAt *time.Time

		if err := rows.Scan(
			&ts.Reference, &ts.Status, &ts.Amount, &ts.Currency,
			&ts.Provider, &ts.Channel,
			&paidAt, &failedAt, &refundedAt, &ts.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan error: %w", err)
		}

		ts.PaidAt = paidAt
		ts.FailedAt = failedAt
		ts.RefundedAt = refundedAt
		results = append(results, ts)
	}

	return results, nil
}

// isTerminal returns true if the status is a final state.
func isTerminal(status string) bool {
	switch status {
	case "success", "failed", "refunded":
		return true
	}
	return false
}
