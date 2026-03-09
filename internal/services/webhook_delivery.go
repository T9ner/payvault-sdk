package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// WebhookDeliveryService forwards PayVault events to merchant webhook URLs.
//
// Architecture:
//   1. When a transaction state changes, a webhook job is enqueued to Redis
//   2. The worker pool picks up jobs and calls DeliverWebhook()
//   3. We POST the normalized event to the merchant's configured URL
//   4. If delivery fails, we retry with exponential backoff (30s, 2m, 8m, 32m, 2h)
//   5. After max retries, the webhook is marked as failed
//   6. Every attempt is logged for merchant visibility
//
// Security:
//   - Each delivery includes an HMAC-SHA256 signature in X-PayVault-Signature
//   - Merchants verify using their webhook secret (from dashboard settings)
//   - Idempotency key prevents duplicate processing
type WebhookDeliveryService struct {
	db         *pgxpool.Pool
	redis      *redis.Client
	crypto     *CryptoService
	httpClient *http.Client
	maxRetries int
}

func NewWebhookDeliveryService(db *pgxpool.Pool, redisClient *redis.Client, crypto *CryptoService, maxRetries int) *WebhookDeliveryService {
	return &WebhookDeliveryService{
		db:    db,
		redis: redisClient,
		crypto: crypto,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			// Don't follow redirects -- merchant must respond at the exact URL
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		maxRetries: maxRetries,
	}
}

// ── Webhook Event Types ──────────────────────────────────────────

const (
	EventTransactionSuccess  = "transaction.success"
	EventTransactionFailed   = "transaction.failed"
	EventTransactionRefunded = "transaction.refunded"
	EventSubscriptionActive  = "subscription.active"
	EventSubscriptionCancelled = "subscription.cancelled"
	EventSubscriptionRenewed = "subscription.renewed"
	EventFraudBlocked        = "fraud.blocked"
	EventFraudFlagged        = "fraud.flagged"
)

// ── Webhook Payload ──────────────────────────────────────────────

type WebhookPayload struct {
	Event          string                 `json:"event"`
	IdempotencyKey string                 `json:"idempotency_key"`
	CreatedAt      string                 `json:"created_at"`
	Data           map[string]interface{} `json:"data"`
}

// ── Enqueue a Webhook Job ────────────────────────────────────────
// Called by transaction/subscription services when state changes occur.

type WebhookJob struct {
	WebhookID  string `json:"webhook_id"`
	MerchantID string `json:"merchant_id"`
	Attempt    int    `json:"attempt"`
}

func (s *WebhookDeliveryService) EnqueueWebhook(ctx context.Context, merchantID, eventType string, data map[string]interface{}) error {
	// Generate idempotency key
	idempotencyKey := fmt.Sprintf("%s:%s:%s:%d", merchantID, eventType, randomHex(8), time.Now().UnixNano())

	// Determine environment from context or default
	env := "live"
	if isTest, ok := ctx.Value(ctxKeyTestMode).(bool); ok && isTest {
		env = "test"
	}

	// Store the webhook event in the database
	var webhookID string
	err := s.db.QueryRow(ctx, `
		INSERT INTO webhooks (merchant_id, provider, environment, event_type, idempotency_key, raw_payload, normalized_event, forward_status)
		VALUES ($1, 'paystack'::provider_name, $2::environment_type, $3, $4, $5, $5, 'pending'::webhook_status)
		RETURNING id
	`, merchantID, env, eventType, idempotencyKey, data).Scan(&webhookID)
	if err != nil {
		return fmt.Errorf("failed to store webhook event: %w", err)
	}

	// Enqueue the delivery job
	job := WebhookJob{
		WebhookID:  webhookID,
		MerchantID: merchantID,
		Attempt:    0,
	}
	jobBytes, _ := json.Marshal(job)

	return s.redis.LPush(ctx, "payvault:queue:webhook_forward", jobBytes).Err()
}

// ── Deliver a Single Webhook ─────────────────────────────────────
// Called by the worker pool when processing a webhook job.

func (s *WebhookDeliveryService) DeliverWebhook(ctx context.Context, jobData string) error {
	var job WebhookJob
	if err := json.Unmarshal([]byte(jobData), &job); err != nil {
		return fmt.Errorf("invalid job data: %w", err)
	}

	// 1. Get merchant's webhook URL and secret
	var webhookURL *string
	var webhookSecretEnc *string
	err := s.db.QueryRow(ctx, `
		SELECT webhook_url, webhook_secret FROM merchant_settings WHERE merchant_id = $1
	`, job.MerchantID).Scan(&webhookURL, &webhookSecretEnc)
	if err != nil || webhookURL == nil || *webhookURL == "" {
		// No webhook URL configured -- mark as delivered (nothing to send)
		_, _ = s.db.Exec(ctx, `
			UPDATE webhooks SET forward_status = 'delivered'::webhook_status, last_forward_at = NOW()
			WHERE id = $1
		`, job.WebhookID)
		return nil
	}

	// 2. Fetch the webhook event payload
	var eventType, idempotencyKey string
	var normalizedEvent map[string]interface{}
	var createdAt time.Time
	err = s.db.QueryRow(ctx, `
		SELECT event_type, idempotency_key, normalized_event, created_at
		FROM webhooks WHERE id = $1
	`, job.WebhookID).Scan(&eventType, &idempotencyKey, &normalizedEvent, &createdAt)
	if err != nil {
		return fmt.Errorf("webhook event not found: %w", err)
	}

	// 3. Build the payload
	payload := WebhookPayload{
		Event:          eventType,
		IdempotencyKey: idempotencyKey,
		CreatedAt:      createdAt.UTC().Format(time.RFC3339),
		Data:           normalizedEvent,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// 4. Sign the payload with merchant's webhook secret
	var signature string
	if webhookSecretEnc != nil && *webhookSecretEnc != "" {
		webhookSecret, err := s.crypto.Decrypt(*webhookSecretEnc)
		if err == nil {
			signature = computeHMAC(payloadBytes, webhookSecret)
		}
	}

	// 5. POST to merchant's webhook URL
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, *webhookURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return s.handleDeliveryFailure(ctx, job, fmt.Sprintf("invalid webhook URL: %v", err))
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-PayVault-Event", eventType)
	req.Header.Set("X-PayVault-Delivery", job.WebhookID)
	req.Header.Set("X-PayVault-Idempotency-Key", idempotencyKey)
	if signature != "" {
		req.Header.Set("X-PayVault-Signature", signature)
	}
	req.Header.Set("User-Agent", "PayVault-Webhook/1.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return s.handleDeliveryFailure(ctx, job, fmt.Sprintf("connection failed: %v", err))
	}
	defer resp.Body.Close()

	// Read response body (limited) for error logging
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

	// 6. Check response -- 2xx = success, anything else = retry
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// Success!
		_, _ = s.db.Exec(ctx, `
			UPDATE webhooks
			SET forward_status = 'delivered'::webhook_status,
			    forward_attempts = forward_attempts + 1,
			    last_forward_at = NOW()
			WHERE id = $1
		`, job.WebhookID)
		return nil
	}

	// Non-2xx response
	return s.handleDeliveryFailure(ctx, job, fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody)))
}

// ── Retry Logic with Exponential Backoff ─────────────────────────
// Schedule: 30s, 2m, 8m, 32m, ~2h (base=30s, multiplier=4)

func (s *WebhookDeliveryService) handleDeliveryFailure(ctx context.Context, job WebhookJob, errMsg string) error {
	job.Attempt++

	// Update attempt count and error
	_, _ = s.db.Exec(ctx, `
		UPDATE webhooks
		SET forward_attempts = $1, last_forward_at = NOW(), last_error = $2
		WHERE id = $3
	`, job.Attempt, errMsg, job.WebhookID)

	// Check if we've exhausted retries
	if job.Attempt >= s.maxRetries {
		_, _ = s.db.Exec(ctx, `
			UPDATE webhooks SET forward_status = 'failed'::webhook_status WHERE id = $1
		`, job.WebhookID)
		return fmt.Errorf("webhook %s failed after %d attempts: %s", job.WebhookID, job.Attempt, errMsg)
	}

	// Schedule retry with exponential backoff
	delay := s.retryDelay(job.Attempt)
	return s.scheduleRetry(ctx, job, delay)
}

func (s *WebhookDeliveryService) retryDelay(attempt int) time.Duration {
	// Exponential backoff: 30s * 4^(attempt-1)
	// Attempt 1: 30s
	// Attempt 2: 2m
	// Attempt 3: 8m
	// Attempt 4: 32m
	// Attempt 5: ~2h8m
	baseDelay := 30 * time.Second
	multiplier := math.Pow(4, float64(attempt-1))
	delay := time.Duration(float64(baseDelay) * multiplier)

	// Cap at 3 hours
	maxDelay := 3 * time.Hour
	if delay > maxDelay {
		delay = maxDelay
	}

	return delay
}

func (s *WebhookDeliveryService) scheduleRetry(ctx context.Context, job WebhookJob, delay time.Duration) error {
	jobBytes, _ := json.Marshal(job)

	// Use Redis sorted set as a delayed queue
	// Score = Unix timestamp when the job should be processed
	executeAt := float64(time.Now().Add(delay).Unix())

	return s.redis.ZAdd(ctx, "payvault:queue:webhook_retry", redis.Z{
		Score:  executeAt,
		Member: string(jobBytes),
	}).Err()
}

// ProcessRetryQueue is called by the worker pool to check for due retries.
// It polls the sorted set for jobs whose score (execute_at) <= now.
func (s *WebhookDeliveryService) ProcessRetryQueue(ctx context.Context) {
	now := fmt.Sprintf("%d", time.Now().Unix())

	// Fetch jobs that are due
	jobs, err := s.redis.ZRangeByScore(ctx, "payvault:queue:webhook_retry", &redis.ZRangeBy{
		Min:   "0",
		Max:   now,
		Count: 10, // Process 10 at a time
	}).Result()
	if err != nil || len(jobs) == 0 {
		return
	}

	for _, jobData := range jobs {
		// Remove from retry queue
		removed, _ := s.redis.ZRem(ctx, "payvault:queue:webhook_retry", jobData).Result()
		if removed == 0 {
			continue // Another worker got it
		}

		// Re-enqueue to the main processing queue
		s.redis.LPush(ctx, "payvault:queue:webhook_forward", jobData)
	}
}

// ── Merchant Webhook Log ─────────────────────────────────────────
// Let merchants see their webhook delivery history from the dashboard.

type WebhookLogEntry struct {
	ID              string     `json:"id"`
	EventType       string     `json:"event_type"`
	IdempotencyKey  string     `json:"idempotency_key"`
	ForwardStatus   string     `json:"forward_status"`
	ForwardAttempts int        `json:"forward_attempts"`
	LastForwardAt   *time.Time `json:"last_forward_at,omitempty"`
	LastError       *string    `json:"last_error,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

func (s *WebhookDeliveryService) ListWebhookLog(ctx context.Context, merchantID string, limit, offset int) ([]WebhookLogEntry, int, error) {
	var total int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM webhooks WHERE merchant_id = $1`, merchantID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, event_type, idempotency_key, forward_status, forward_attempts, last_forward_at, last_error, created_at
		FROM webhooks WHERE merchant_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, merchantID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []WebhookLogEntry
	for rows.Next() {
		var e WebhookLogEntry
		if err := rows.Scan(&e.ID, &e.EventType, &e.IdempotencyKey, &e.ForwardStatus, &e.ForwardAttempts, &e.LastForwardAt, &e.LastError, &e.CreatedAt); err != nil {
			return nil, 0, err
		}
		entries = append(entries, e)
	}

	return entries, total, nil
}

// ── Manual Retry ─────────────────────────────────────────────────
// Let merchants manually retry a failed webhook from the dashboard.

func (s *WebhookDeliveryService) RetryWebhook(ctx context.Context, merchantID, webhookID string) error {
	// Verify ownership and that it's in a failed state
	var status string
	err := s.db.QueryRow(ctx, `
		SELECT forward_status FROM webhooks WHERE id = $1 AND merchant_id = $2
	`, webhookID, merchantID).Scan(&status)
	if err != nil {
		return fmt.Errorf("webhook not found")
	}
	if status == "delivered" {
		return fmt.Errorf("webhook already delivered")
	}

	// Reset status and re-enqueue
	_, _ = s.db.Exec(ctx, `
		UPDATE webhooks SET forward_status = 'pending'::webhook_status, forward_attempts = 0 WHERE id = $1
	`, webhookID)

	job := WebhookJob{
		WebhookID:  webhookID,
		MerchantID: merchantID,
		Attempt:    0,
	}
	jobBytes, _ := json.Marshal(job)

	return s.redis.LPush(ctx, "payvault:queue:webhook_forward", jobBytes).Err()
}

// ── HMAC Signature ───────────────────────────────────────────────

func computeHMAC(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}
