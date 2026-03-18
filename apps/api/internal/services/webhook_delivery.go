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
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// WebhookDeliveryService forwards PayVault events to merchant webhook URLs.
type WebhookDeliveryService struct {
	db         *pgxpool.Pool
	crypto     *CryptoService
	httpClient *http.Client
}

func NewWebhookDeliveryService(db *pgxpool.Pool, crypto *CryptoService, maxRetries int) *WebhookDeliveryService {
	return &WebhookDeliveryService{
		db:     db,
		crypto: crypto,
		httpClient: &http.Client{
			Timeout: 10 * time.Second, // Prompt: ~10 seconds
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// ── Webhook Event Types ──────────────────────────────────────────

const (
	EventTransactionSuccess    = "transaction.success"
	EventTransactionFailed     = "transaction.failed"
	EventSubscriptionCreated   = "subscription.created"
	EventSubscriptionCancelled = "subscription.cancelled"
)

// ── Webhook Payload ──────────────────────────────────────────────

type WebhookLog struct {
	ID            string    `json:"id"`
	EventType     string    `json:"event_type"`
	URL           string    `json:"url"`
	Status        string    `json:"status"`
	ResponseCode  int       `json:"response_code"`
	Attempts      int       `json:"attempts"`
	LastAttemptAt time.Time `json:"last_attempt_at"`
}

// ── Dispatch a Webhook ───────────────────────────────────────────

// DispatchWebhook is called internally when key events happen.
func (s *WebhookDeliveryService) DispatchWebhook(ctx context.Context, merchantID string, eventType string, payload map[string]interface{}) error {
	// Look up merchant's configured webhook URL
	var webhookURL, webhookSecret string
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(webhook_url, ''), COALESCE(webhook_secret, '') 
		FROM merchants WHERE id = $1
	`, merchantID).Scan(&webhookURL, &webhookSecret)
	
	if err != nil || webhookURL == "" {
		return nil // Ignore if no webhook configured
	}

	payloadBytes, _ := json.Marshal(payload)

	// Record initial pending log
	var logID string
	now := time.Now()
	err = s.db.QueryRow(ctx, `
		INSERT INTO webhook_logs (merchant_id, event_type, url, payload, status, response_code, attempts, last_attempt_at)
		VALUES ($1, $2, $3, $4, 'pending', 0, 0, $5) RETURNING id
	`, merchantID, eventType, webhookURL, payloadBytes, now).Scan(&logID)
	if err != nil {
		return fmt.Errorf("failed to create webhook log: %w", err)
	}

	// Attempt delivery
	return s.deliverWebhookLog(ctx, logID, webhookURL, webhookSecret, eventType, payloadBytes)
}

func (s *WebhookDeliveryService) deliverWebhookLog(ctx context.Context, logID, webhookURL, webhookSecret, eventType string, payloadBytes []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return s.markWebhookLog(ctx, logID, "failed", 0, err.Error())
	}

	req.Header.Set("Content-Type", "application/json")
	if webhookSecret != "" {
		signature := computeHMAC(payloadBytes, webhookSecret)
		req.Header.Set("PayVault-Signature", signature)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return s.markWebhookLog(ctx, logID, "failed", 0, err.Error())
	}
	defer resp.Body.Close()

	respCode := resp.StatusCode
	respBodyBits, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	respBodyStr := string(respBodyBits)

	status := "failed"
	if respCode >= 200 && respCode < 300 {
		status = "delivered"
	}

	return s.markWebhookLog(ctx, logID, status, respCode, respBodyStr)
}

func (s *WebhookDeliveryService) markWebhookLog(ctx context.Context, logID, status string, respCode int, respBody string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE webhook_logs
		SET status = $1, response_code = $2, response_body = $3, attempts = attempts + 1, last_attempt_at = NOW()
		WHERE id = $4
	`, status, respCode, respBody, logID)
	return err
}

// ── Merchant Webhook Log ─────────────────────────────────────────

func (s *WebhookDeliveryService) ListWebhookLogs(ctx context.Context, merchantID string, limit, offset int) ([]WebhookLog, int, error) {
	var total int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM webhook_logs WHERE merchant_id = $1`, merchantID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, event_type, url, status, response_code, attempts, last_attempt_at
		FROM webhook_logs WHERE merchant_id = $1
		ORDER BY last_attempt_at DESC LIMIT $2 OFFSET $3
	`, merchantID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []WebhookLog
	for rows.Next() {
		var e WebhookLog
		if err := rows.Scan(&e.ID, &e.EventType, &e.URL, &e.Status, &e.ResponseCode, &e.Attempts, &e.LastAttemptAt); err != nil {
			return nil, 0, err
		}
		entries = append(entries, e)
	}

	if entries == nil {
		entries = []WebhookLog{}
	}

	return entries, total, nil
}

// ── Manual Retry ─────────────────────────────────────────────────

func (s *WebhookDeliveryService) RetryWebhook(ctx context.Context, merchantID, logID string) (*WebhookLog, error) {
	var url, eventType, payloadStr string
	var status string
	err := s.db.QueryRow(ctx, `
		SELECT url, event_type, payload, status FROM webhook_logs WHERE id = $1 AND merchant_id = $2
	`, logID, merchantID).Scan(&url, &eventType, &payloadStr, &status)
	if err != nil {
		return nil, fmt.Errorf("webhook log not found")
	}

	var webhookSecret string
	_ = s.db.QueryRow(ctx, `SELECT COALESCE(webhook_secret, '') FROM merchants WHERE id = $1`, merchantID).Scan(&webhookSecret)

	// Deliver again
	err = s.deliverWebhookLog(ctx, logID, url, webhookSecret, eventType, []byte(payloadStr))
	if err != nil {
		return nil, err
	}

	// Fetch updated log
	var log WebhookLog
	err = s.db.QueryRow(ctx, `
		SELECT id, event_type, url, status, response_code, attempts, last_attempt_at
		FROM webhook_logs WHERE id = $1
	`, logID).Scan(&log.ID, &log.EventType, &log.URL, &log.Status, &log.ResponseCode, &log.Attempts, &log.LastAttemptAt)
	if err != nil {
		return nil, err
	}

	return &log, nil
}

// ── HMAC Signature ───────────────────────────────────────────────

func computeHMAC(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}
