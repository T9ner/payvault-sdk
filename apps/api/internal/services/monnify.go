package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"
)

type MonnifyProvider struct {
	client *http.Client
}

func NewMonnifyProvider() *MonnifyProvider {
	return &MonnifyProvider{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (m *MonnifyProvider) Name() string { return "monnify" }

func (m *MonnifyProvider) InitiateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	rawSecret, _ := ctx.Value(ctxKeySecretKey).(string)
	apiKey, secretKey, contractCode, err := parseMonnifyCredentials(rawSecret)
	if err != nil {
		return nil, fmt.Errorf("monnify: %w", err)
	}

	accessToken, err := m.fetchAccessToken(ctx, apiKey, secretKey)
	if err != nil {
		return nil, fmt.Errorf("monnify initiate charge auth: %w", err)
	}

	body := map[string]interface{}{
		"amount":             float64(req.AmountKobo) / 100.0,
		"customerName":       req.Email,
		"customerEmail":      req.Email,
		"paymentReference":   req.Reference,
		"paymentDescription": "Payment",
		"currencyCode":       req.Currency,
		"contractCode":       contractCode,
		"redirectUrl":        req.CallbackURL,
		"paymentMethods":     []string{"CARD", "ACCOUNT_TRANSFER"},
	}

	data, err := m.doRequest(ctx, "POST", "/v1/merchant/transactions/init-transaction", body, accessToken, apiKey)
	if err != nil {
		return nil, fmt.Errorf("monnify initiate charge: %w", err)
	}

	resData, _ := data["responseBody"].(map[string]interface{})
	return &ChargeResponse{
		ProviderRef: getString(resData, "transactionReference"),
		AuthURL:     getString(resData, "checkoutUrl"),
		Status:      "pending",
		RawResponse: data,
	}, nil
}

func (m *MonnifyProvider) VerifyTransaction(ctx context.Context, providerRef string) (*VerifyResponse, error) {
	rawSecret, _ := ctx.Value(ctxKeySecretKey).(string)
	apiKey, secretKey, _, err := parseMonnifyCredentials(rawSecret)
	if err != nil {
		return nil, fmt.Errorf("monnify: %w", err)
	}

	accessToken, err := m.fetchAccessToken(ctx, apiKey, secretKey)
	if err != nil {
		return nil, fmt.Errorf("monnify verify auth: %w", err)
	}

	data, err := m.doRequest(ctx, "GET", "/v2/transactions/"+providerRef, nil, accessToken, apiKey)
	if err != nil {
		return nil, fmt.Errorf("monnify verify: %w", err)
	}

	resData, _ := data["responseBody"].(map[string]interface{})
	amountPaid, _ := resData["amountPaid"].(float64)

	return &VerifyResponse{
		ProviderRef: getString(resData, "transactionReference"),
		Status:      mapMonnifyStatus(getString(resData, "paymentStatus")),
		AmountKobo:  int64(math.Round(amountPaid * 100)),
		Currency:    getString(resData, "currencyCode"),
		PaidAt:      getString(resData, "paidOn"),
		Channel:     getString(resData, "paymentMethod"),
		RawResponse: data,
	}, nil
}

func (m *MonnifyProvider) Refund(ctx context.Context, providerRef string, amountKobo int64) (*RefundResponse, error) {
	return nil, fmt.Errorf("monnify: refunds must be processed manually via the Monnify merchant dashboard")
}

func (m *MonnifyProvider) VerifyWebhookSignature(payload []byte, signature string, secret string) bool {
	_, secretKey, _, err := parseMonnifyCredentials(secret)
	if err != nil {
		return false
	}

	mac := hmac.New(sha512.New, []byte(secretKey))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(strings.ToLower(signature)))
}

func (m *MonnifyProvider) fetchAccessToken(ctx context.Context, apiKey, secretKey string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", monnifyBaseURL(apiKey)+"/v1/auth/login", nil)
	if err != nil {
		return "", err
	}

	credentials := base64.StdEncoding.EncodeToString([]byte(apiKey + ":" + secretKey))
	req.Header.Set("Authorization", "Basic "+credentials)

	resp, err := m.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("monnify auth: invalid JSON response: %s", string(respBody))
	}

	if success, ok := result["requestSuccessful"].(bool); ok && !success {
		msg := getString(result, "responseMessage")
		if msg == "" {
			msg = "authentication failed"
		}
		return "", fmt.Errorf("monnify auth API error: %s", msg)
	}

	resData, _ := result["responseBody"].(map[string]interface{})
	token := getString(resData, "accessToken")
	if token == "" {
		return "", fmt.Errorf("monnify auth: access token missing from response")
	}

	return token, nil
}

func (m *MonnifyProvider) doRequest(ctx context.Context, method, path string, body interface{}, accessToken, apiKey string) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, monnifyBaseURL(apiKey)+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
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
		return nil, fmt.Errorf("monnify: invalid JSON response: %s", string(respBody))
	}

	if success, ok := result["requestSuccessful"].(bool); ok && !success {
		msg := getString(result, "responseMessage")
		if msg == "" {
			msg = resp.Status
		}
		return nil, fmt.Errorf("monnify API error: %s", msg)
	}

	return result, nil
}

func monnifyBaseURL(apiKey string) string {
	if strings.HasPrefix(apiKey, "MK_TEST_") {
		return "https://sandbox.monnify.com/api"
	}
	return "https://api.monnify.com/api"
}

func parseMonnifyCredentials(secret string) (string, string, string, error) {
	parts := strings.SplitN(secret, "|", 3)
	if len(parts) != 3 {
		return "", "", "", fmt.Errorf("credentials must be encoded as apiKey|secretKey|contractCode")
	}
	apiKey := strings.TrimSpace(parts[0])
	secretKey := strings.TrimSpace(parts[1])
	contractCode := strings.TrimSpace(parts[2])
	if apiKey == "" || secretKey == "" || contractCode == "" {
		return "", "", "", fmt.Errorf("credentials must include apiKey, secretKey, and contractCode")
	}
	return apiKey, secretKey, contractCode, nil
}

func mapMonnifyStatus(status string) string {
	switch status {
	case "PAID", "OVERPAID":
		return "success"
	case "FAILED", "EXPIRED", "CANCELLED":
		return "failed"
	default:
		return "pending"
	}
}
