package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const paystackBaseURL = "https://api.paystack.co"

// PaystackProvider implements the Provider interface for Paystack.
type PaystackProvider struct {
	client *http.Client
}

func NewPaystackProvider() *PaystackProvider {
	return &PaystackProvider{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (p *PaystackProvider) Name() string { return "paystack" }

// InitiateCharge creates a Paystack transaction and returns the authorization URL.
func (p *PaystackProvider) InitiateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("paystack: secret key required in context")
	}

	body := map[string]interface{}{
		"reference":    req.Reference,
		"amount":       req.AmountKobo,
		"currency":     req.Currency,
		"email":        req.Email,
		"callback_url": req.CallbackURL,
	}
	if req.Metadata != nil {
		body["metadata"] = req.Metadata
	}

	data, err := p.doRequest(ctx, "POST", "/transaction/initialize", body, secretKey)
	if err != nil {
		return nil, fmt.Errorf("paystack initiate charge: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	return &ChargeResponse{
		ProviderRef: getString(resData, "reference"),
		AuthURL:     getString(resData, "authorization_url"),
		Status:      "pending",
		RawResponse: data,
	}, nil
}

// VerifyTransaction checks the status of a Paystack transaction.
func (p *PaystackProvider) VerifyTransaction(ctx context.Context, providerRef string) (*VerifyResponse, error) {
	// Secret key must be passed via context for multi-tenant support
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("paystack: secret key required in context")
	}

	data, err := p.doRequest(ctx, "GET", "/transaction/verify/"+providerRef, nil, secretKey)
	if err != nil {
		return nil, fmt.Errorf("paystack verify: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	amount, _ := resData["amount"].(float64)

	return &VerifyResponse{
		ProviderRef: getString(resData, "reference"),
		Status:      mapPaystackStatus(getString(resData, "status")),
		AmountKobo:  int64(amount),
		Currency:    getString(resData, "currency"),
		PaidAt:      getString(resData, "paid_at"),
		Channel:     getString(resData, "channel"),
		RawResponse: data,
	}, nil
}

// Refund processes a full or partial refund on Paystack.
func (p *PaystackProvider) Refund(ctx context.Context, providerRef string, amountKobo int64) (*RefundResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("paystack: secret key required in context")
	}

	body := map[string]interface{}{
		"transaction": providerRef,
	}
	if amountKobo > 0 {
		body["amount"] = amountKobo // Partial refund
	}

	data, err := p.doRequest(ctx, "POST", "/refund", body, secretKey)
	if err != nil {
		return nil, fmt.Errorf("paystack refund: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	refundAmount, _ := resData["amount"].(float64)

	return &RefundResponse{
		ProviderRef: getString(resData, "id"),
		Status:      mapPaystackRefundStatus(getString(resData, "status")),
		AmountKobo:  int64(refundAmount),
		RawResponse: data,
	}, nil
}

// VerifyWebhookSignature validates the HMAC-SHA512 signature from Paystack.
func (p *PaystackProvider) VerifyWebhookSignature(payload []byte, signature string, secret string) bool {
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// --- Internal helpers ---

func (p *PaystackProvider) doRequest(ctx context.Context, method, path string, body interface{}, secretKey string) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, paystackBaseURL+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("paystack: invalid JSON response: %s", string(respBody))
	}

	// Paystack returns {status: true/false, message: "...", data: {...}}
	if status, ok := result["status"].(bool); ok && !status {
		msg, _ := result["message"].(string)
		return nil, fmt.Errorf("paystack API error: %s", msg)
	}

	return result, nil
}

// mapPaystackStatus normalizes Paystack transaction statuses.
func mapPaystackStatus(status string) string {
	switch status {
	case "success":
		return "success"
	case "failed":
		return "failed"
	case "abandoned":
		return "abandoned"
	default:
		return "pending"
	}
}

func mapPaystackRefundStatus(status string) string {
	switch status {
	case "processed":
		return "processed"
	case "pending":
		return "pending"
	default:
		return "failed"
	}
}

// Context keys, WithSecretKey, and getString are defined in helpers.go
