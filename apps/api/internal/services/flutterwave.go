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
)

const flutterwaveBaseURL = "https://api.flutterwave.com/v3"

// FlutterwaveProvider implements the Provider interface for Flutterwave.
type FlutterwaveProvider struct {
	client *http.Client
}

func NewFlutterwaveProvider() *FlutterwaveProvider {
	return &FlutterwaveProvider{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (f *FlutterwaveProvider) Name() string { return "flutterwave" }

// InitiateCharge creates a Flutterwave payment link and returns the redirect URL.
func (f *FlutterwaveProvider) InitiateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("flutterwave: secret key required in context")
	}

	// Flutterwave uses major currency units (NGN, not kobo)
	amount := float64(req.AmountKobo) / 100.0

	body := map[string]interface{}{
		"tx_ref":       req.Reference,
		"amount":       amount,
		"currency":     req.Currency,
		"redirect_url": req.CallbackURL,
		"customer": map[string]interface{}{
			"email": req.Email,
		},
	}
	if req.Metadata != nil {
		body["meta"] = req.Metadata
	}

	data, err := f.doRequest(ctx, "POST", "/payments", body, secretKey)
	if err != nil {
		return nil, fmt.Errorf("flutterwave initiate charge: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	return &ChargeResponse{
		ProviderRef: req.Reference, // Flutterwave uses tx_ref as the reference
		AuthURL:     getString(resData, "link"),
		Status:      "pending",
		RawResponse: data,
	}, nil
}

// VerifyTransaction checks the status of a Flutterwave transaction by ID.
func (f *FlutterwaveProvider) VerifyTransaction(ctx context.Context, providerRef string) (*VerifyResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("flutterwave: secret key required in context")
	}

	// Flutterwave verify uses transaction ID, not tx_ref
	// For tx_ref based lookup, use /transactions/verify_by_reference?tx_ref=xxx
	data, err := f.doRequest(ctx, "GET", "/transactions/verify_by_reference?tx_ref="+providerRef, nil, secretKey)
	if err != nil {
		return nil, fmt.Errorf("flutterwave verify: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	amount, _ := resData["amount"].(float64)

	return &VerifyResponse{
		ProviderRef: getString(resData, "tx_ref"),
		Status:      mapFlutterwaveStatus(getString(resData, "status")),
		AmountKobo:  int64(amount * 100), // Convert back to kobo
		Currency:    getString(resData, "currency"),
		PaidAt:      getString(resData, "created_at"),
		Channel:     getString(resData, "payment_type"),
		RawResponse: data,
	}, nil
}

// Refund processes a refund on Flutterwave.
func (f *FlutterwaveProvider) Refund(ctx context.Context, providerRef string, amountKobo int64) (*RefundResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("flutterwave: secret key required in context")
	}

	// First, we need the Flutterwave transaction ID
	// providerRef here is the flutterwave transaction ID
	body := map[string]interface{}{}
	if amountKobo > 0 {
		body["amount"] = float64(amountKobo) / 100.0 // Flutterwave uses major units
	}

	data, err := f.doRequest(ctx, "POST", "/transactions/"+providerRef+"/refund", body, secretKey)
	if err != nil {
		return nil, fmt.Errorf("flutterwave refund: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	refundAmount, _ := resData["amount_refunded"].(float64)

	return &RefundResponse{
		ProviderRef: fmt.Sprintf("%v", resData["id"]),
		Status:      mapFlutterwaveRefundStatus(getString(resData, "status")),
		AmountKobo:  int64(refundAmount * 100),
		RawResponse: data,
	}, nil
}

// VerifyWebhookSignature validates the Flutterwave webhook hash.
// Flutterwave sends a verif-hash header that must match your secret hash.
func (f *FlutterwaveProvider) VerifyWebhookSignature(payload []byte, signature string, secret string) bool {
	// Flutterwave v3 uses a simple hash comparison
	// The "verif-hash" header must equal the secret hash you set in your dashboard
	// For extra security, also verify with HMAC-SHA256
	if signature == secret {
		return true
	}
	// Fallback: HMAC-SHA256 verification (newer Flutterwave webhooks)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// --- Internal helpers ---

func (f *FlutterwaveProvider) doRequest(ctx context.Context, method, path string, body interface{}, secretKey string) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, flutterwaveBaseURL+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := f.client.Do(req)
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
		return nil, fmt.Errorf("flutterwave: invalid JSON response: %s", string(respBody))
	}

	// Flutterwave returns {status: "success"/"error", message: "...", data: {...}}
	if status := getString(result, "status"); status == "error" {
		msg := getString(result, "message")
		return nil, fmt.Errorf("flutterwave API error: %s", msg)
	}

	return result, nil
}

func mapFlutterwaveStatus(status string) string {
	switch status {
	case "successful":
		return "success"
	case "failed":
		return "failed"
	default:
		return "pending"
	}
}

func mapFlutterwaveRefundStatus(status string) string {
	switch status {
	case "completed":
		return "processed"
	case "pending":
		return "pending"
	default:
		return "failed"
	}
}
