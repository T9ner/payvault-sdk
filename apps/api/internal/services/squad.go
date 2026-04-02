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
	"strings"
	"time"
)

type SquadProvider struct {
	client *http.Client
}

func NewSquadProvider() *SquadProvider {
	return &SquadProvider{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *SquadProvider) Name() string { return "squad" }

func (s *SquadProvider) InitiateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("squad: secret key required in context")
	}

	body := map[string]interface{}{
		"email":           req.Email,
		"amount":          req.AmountKobo,
		"currency":        req.Currency,
		"initiate_type":   "inline",
		"transaction_ref": req.Reference,
		"callback_url":    req.CallbackURL,
	}

	data, err := s.doRequest(ctx, "POST", "/transaction/initiate", body, secretKey)
	if err != nil {
		return nil, fmt.Errorf("squad initiate charge: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	return &ChargeResponse{
		ProviderRef: getString(resData, "transaction_ref"),
		AuthURL:     getString(resData, "checkout_url"),
		Status:      "pending",
		RawResponse: data,
	}, nil
}

func (s *SquadProvider) VerifyTransaction(ctx context.Context, providerRef string) (*VerifyResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("squad: secret key required in context")
	}

	data, err := s.doRequest(ctx, "GET", "/transaction/verify/"+providerRef, nil, secretKey)
	if err != nil {
		return nil, fmt.Errorf("squad verify: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})

	return &VerifyResponse{
		ProviderRef: getString(resData, "transaction_ref"),
		Status:      mapSquadStatus(getString(resData, "transaction_status")),
		AmountKobo:  squadInt64(resData["amount"]),
		Currency:    getString(resData, "currency"),
		PaidAt:      getString(resData, "paid_at"),
		Channel:     getString(resData, "payment_channel"),
		RawResponse: data,
	}, nil
}

func (s *SquadProvider) Refund(ctx context.Context, providerRef string, amountKobo int64) (*RefundResponse, error) {
	secretKey, _ := ctx.Value(ctxKeySecretKey).(string)
	if secretKey == "" {
		return nil, fmt.Errorf("squad: secret key required in context")
	}

	body := map[string]interface{}{
		"gateway_transaction_ref": providerRef,
		"transaction_ref":         providerRef,
		"refund_type":             1,
		"reason_for_refund":       "Customer request",
	}

	data, err := s.doRequest(ctx, "POST", "/transaction/refund", body, secretKey)
	if err != nil {
		return nil, fmt.Errorf("squad refund: %w", err)
	}

	resData, _ := data["data"].(map[string]interface{})
	refundRef := getString(resData, "refund_ref")
	if refundRef == "" {
		refundRef = getString(resData, "transaction_ref")
	}
	if refundRef == "" {
		refundRef = providerRef
	}

	return &RefundResponse{
		ProviderRef: refundRef,
		Status:      "processed",
		AmountKobo:  amountKobo,
		RawResponse: data,
	}, nil
}

func (s *SquadProvider) VerifyWebhookSignature(payload []byte, signature string, secret string) bool {
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(strings.ToLower(signature)))
}

func (s *SquadProvider) doRequest(ctx context.Context, method, path string, body interface{}, secretKey string) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, squadBaseURL(secretKey)+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
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
		return nil, fmt.Errorf("squad: invalid JSON response: %s", string(respBody))
	}

	if success, ok := result["success"].(bool); ok && !success {
		msg := getString(result, "message")
		if msg == "" {
			msg = resp.Status
		}
		return nil, fmt.Errorf("squad API error: %s", msg)
	}

	return result, nil
}

func squadBaseURL(secretKey string) string {
	if strings.HasPrefix(secretKey, "sandbox_") {
		return "https://sandbox-api-d.squadco.com"
	}
	return "https://api-d.squadco.com"
}

func mapSquadStatus(status string) string {
	switch status {
	case "success", "successful":
		return "success"
	case "failed", "declined":
		return "failed"
	default:
		return "pending"
	}
}

func squadInt64(v interface{}) int64 {
	switch value := v.(type) {
	case float64:
		return int64(value)
	case float32:
		return int64(value)
	case int:
		return int64(value)
	case int64:
		return value
	case json.Number:
		n, _ := value.Int64()
		return n
	default:
		return 0
	}
}
