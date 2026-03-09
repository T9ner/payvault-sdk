package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"payvault-api/internal/middleware"
	"payvault-api/internal/services"

	"github.com/go-chi/chi/v5"
)

// Handlers holds all HTTP handler dependencies.
type Handlers struct {
	auth        *services.AuthService
	transaction *services.TransactionService
	providers   *services.ProviderRegistry
	crypto      *services.CryptoService
	links       *services.PaymentLinkService
	subs        *services.SubscriptionService
	fraud       *services.FraudService
	webhookDlv  *services.WebhookDeliveryService
}

func NewHandlers(
	auth *services.AuthService,
	txn *services.TransactionService,
	providers *services.ProviderRegistry,
	crypto *services.CryptoService,
	links *services.PaymentLinkService,
	subs *services.SubscriptionService,
	fraud *services.FraudService,
	webhookDlv *services.WebhookDeliveryService,
) *Handlers {
	return &Handlers{
		auth:        auth,
		transaction: txn,
		providers:   providers,
		crypto:      crypto,
		links:       links,
		subs:        subs,
		fraud:       fraud,
		webhookDlv:  webhookDlv,
	}
}

// ==================== Auth Handlers ====================

// POST /api/v1/auth/register
func (h *Handlers) Register(w http.ResponseWriter, r *http.Request) {
	var input struct {
		BusinessName string `json:"business_name"`
		Email        string `json:"email"`
		Password     string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.BusinessName == "" || input.Email == "" || input.Password == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "business_name, email, and password are required")
		return
	}

	merchant, err := h.auth.RegisterMerchant(r.Context(), input.BusinessName, input.Email, input.Password)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusConflict, err.Error())
		return
	}

	token, err := h.auth.GenerateJWT(merchant.ID, merchant.Email)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, map[string]interface{}{
		"merchant": map[string]interface{}{
			"id":            merchant.ID,
			"business_name": merchant.BusinessName,
			"email":         merchant.Email,
		},
		"token": token,
	})
}

// POST /api/v1/auth/login
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	merchant, err := h.auth.AuthenticateMerchant(r.Context(), input.Email, input.Password)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	token, err := h.auth.GenerateJWT(merchant.ID, merchant.Email)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"merchant": map[string]interface{}{
			"id":            merchant.ID,
			"business_name": merchant.BusinessName,
			"email":         merchant.Email,
		},
		"token": token,
	})
}

// ==================== API Key Handlers ====================

// POST /api/v1/dashboard/api-keys
func (h *Handlers) GenerateAPIKey(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input struct {
		Mode  string `json:"mode"` // "live" or "test"
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Mode == "" {
		input.Mode = "test"
	}

	keys, err := h.auth.GenerateAPIKeyPair(r.Context(), merchantID, input.Mode, input.Label)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, map[string]interface{}{
		"message":    "API keys generated. Store your secret key securely -- it won't be shown again.",
		"public_key": keys.PublicKey,
		"secret_key": keys.SecretKey,
		"mode":       input.Mode,
	})
}

// ==================== Provider Credential Handlers ====================

// POST /api/v1/dashboard/providers
func (h *Handlers) SaveProviderCredentials(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input struct {
		Provider  string `json:"provider"`   // "paystack" or "flutterwave"
		SecretKey string `json:"secret_key"` // Provider's secret key
		PublicKey string `json:"public_key"` // Provider's public key
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Provider == "" || input.SecretKey == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "provider and secret_key are required")
		return
	}

	if err := h.auth.StoreProviderCredentials(r.Context(), merchantID, input.Provider, input.SecretKey, input.PublicKey); err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"message":  "Provider credentials saved securely",
		"provider": input.Provider,
	})
}

// ==================== Transaction Handlers ====================

// POST /api/v1/payments/charge
func (h *Handlers) InitiateCharge(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.InitiateChargeInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Provider == "" || input.AmountKobo <= 0 || input.Email == "" || input.Currency == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "provider, amount, currency, and email are required")
		return
	}

	result, err := h.transaction.InitiateCharge(r.Context(), merchantID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, result)
}

// GET /api/v1/payments/verify/{reference}
func (h *Handlers) VerifyTransaction(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	reference := chi.URLParam(r, "reference")
	if reference == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "reference is required")
		return
	}

	result, err := h.transaction.VerifyTransaction(r.Context(), merchantID, reference)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, result)
}

// POST /api/v1/payments/refund
func (h *Handlers) RefundTransaction(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input struct {
		Reference  string `json:"reference"`
		AmountKobo int64  `json:"amount"` // 0 = full refund
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Reference == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "reference is required")
		return
	}

	result, err := h.transaction.RefundTransaction(r.Context(), merchantID, input.Reference, input.AmountKobo)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, result)
}

// GET /api/v1/payments/transactions
func (h *Handlers) ListTransactions(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	txns, total, err := h.transaction.ListTransactions(r.Context(), merchantID, limit, offset)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"transactions": txns,
		"total":        total,
		"limit":        limit,
		"offset":       offset,
	})
}

// ==================== Payment Link Handlers ====================

// POST /api/v1/dashboard/links
func (h *Handlers) CreatePaymentLink(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.CreatePaymentLinkInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Name == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "name is required")
		return
	}

	link, err := h.links.CreateLink(r.Context(), merchantID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, link)
}

// GET /api/v1/dashboard/links
func (h *Handlers) ListPaymentLinks(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	limit, offset := parsePagination(r)

	links, total, err := h.links.ListLinks(r.Context(), merchantID, limit, offset)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"links":  links,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// DELETE /api/v1/dashboard/links/{id}
func (h *Handlers) DeactivatePaymentLink(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	linkID := chi.URLParam(r, "id")

	if err := h.links.DeactivateLink(r.Context(), merchantID, linkID); err != nil {
		middleware.ErrorResponse(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{"message": "Payment link deactivated"})
}

// GET /api/v1/checkout/{slug} (public -- no auth)
func (h *Handlers) GetCheckoutPage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	link, err := h.links.GetBySlug(r.Context(), slug)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, link)
}

// POST /api/v1/checkout/{slug}/pay (public -- no auth)
func (h *Handlers) CheckoutPay(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	var input services.CheckoutInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Email == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "email is required")
		return
	}

	result, err := h.links.Checkout(r.Context(), slug, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, result)
}

// ==================== Subscription Handlers ====================

// POST /api/v1/dashboard/subscriptions/plans
func (h *Handlers) CreatePlan(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.CreatePlanInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Provider == "" || input.Name == "" || input.Amount <= 0 || input.Interval == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "provider, name, amount, and interval are required")
		return
	}

	plan, err := h.subs.CreatePlan(r.Context(), merchantID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, plan)
}

// POST /api/v1/payments/subscribe
func (h *Handlers) Subscribe(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.SubscribeInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Provider == "" || input.PlanCode == "" || input.Email == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "provider, plan_code, and email are required")
		return
	}

	result, err := h.subs.Subscribe(r.Context(), merchantID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, result)
}

// POST /api/v1/dashboard/subscriptions/{id}/cancel
func (h *Handlers) CancelSubscription(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	subID := chi.URLParam(r, "id")

	if err := h.subs.Cancel(r.Context(), merchantID, subID); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{"message": "Subscription cancelled"})
}

// GET /api/v1/dashboard/subscriptions
func (h *Handlers) ListSubscriptions(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	limit, offset := parsePagination(r)

	subs, total, err := h.subs.ListSubscriptions(r.Context(), merchantID, limit, offset)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"subscriptions": subs,
		"total":         total,
		"limit":         limit,
		"offset":        offset,
	})
}

// ==================== Fraud Handlers ====================

// PUT /api/v1/dashboard/fraud/rules
func (h *Handlers) UpsertFraudRule(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.UpdateFraudRuleInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.RuleName == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "rule_name is required")
		return
	}

	if err := h.fraud.UpsertRule(r.Context(), merchantID, input); err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{"message": "Fraud rule updated"})
}

// GET /api/v1/dashboard/fraud/events
func (h *Handlers) ListFraudEvents(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	limit, offset := parsePagination(r)

	events, total, err := h.fraud.ListFraudEvents(r.Context(), merchantID, limit, offset)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// ==================== Webhook Log Handlers ====================

// GET /api/v1/dashboard/webhooks
func (h *Handlers) ListWebhookLog(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	limit, offset := parsePagination(r)

	entries, total, err := h.webhookDlv.ListWebhookLog(r.Context(), merchantID, limit, offset)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"webhooks": entries,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// POST /api/v1/dashboard/webhooks/{id}/retry
func (h *Handlers) RetryWebhook(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	webhookID := chi.URLParam(r, "id")

	if err := h.webhookDlv.RetryWebhook(r.Context(), merchantID, webhookID); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{"message": "Webhook retry scheduled"})
}

// ==================== Provider Webhook Handlers ====================

// POST /api/v1/webhooks/paystack
func (h *Handlers) PaystackWebhook(w http.ResponseWriter, r *http.Request) {
	h.handleProviderWebhook(w, r, "paystack", "x-paystack-signature")
}

// POST /api/v1/webhooks/flutterwave
func (h *Handlers) FlutterwaveWebhook(w http.ResponseWriter, r *http.Request) {
	h.handleProviderWebhook(w, r, "flutterwave", "verif-hash")
}

func (h *Handlers) handleProviderWebhook(w http.ResponseWriter, r *http.Request, providerName, sigHeader string) {
	// 1. Read raw body for signature verification
	body, err := io.ReadAll(r.Body)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Failed to read request body")
		return
	}
	defer r.Body.Close()

	signature := r.Header.Get(sigHeader)

	// 2. Parse the event payload
	var event map[string]interface{}
	if err := json.Unmarshal(body, &event); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	// 3. Extract reference from event to find the merchant
	reference := extractReference(event, providerName)
	if reference == "" {
		// Respond 200 to avoid retries for events we don't handle
		w.WriteHeader(http.StatusOK)
		return
	}

	// 4. Look up the transaction to get the merchant
	var merchantID string
	err = h.transaction.LookupMerchantByReference(r.Context(), reference, &merchantID)
	if err != nil {
		// Unknown transaction -- respond 200 to stop retries
		w.WriteHeader(http.StatusOK)
		return
	}

	// 5. Get merchant's provider secret for signature verification
	provider, err := h.providers.Get(providerName)
	if err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Note: In production, verify signature against merchant's secret key
	if signature != "" {
		_ = provider // Signature verification would go here
	}

	// 6. Verify the transaction with the provider (source of truth)
	_, err = h.transaction.VerifyTransaction(r.Context(), merchantID, reference)
	if err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// extractReference pulls the transaction reference from different provider webhook formats.
func extractReference(event map[string]interface{}, provider string) string {
	switch provider {
	case "paystack":
		// Paystack: {event: "charge.success", data: {reference: "xxx"}}
		data, _ := event["data"].(map[string]interface{})
		ref, _ := data["reference"].(string)
		return ref
	case "flutterwave":
		// Flutterwave: {event: "charge.completed", data: {tx_ref: "xxx"}}
		data, _ := event["data"].(map[string]interface{})
		ref, _ := data["tx_ref"].(string)
		return ref
	default:
		return ""
	}
}

// ==================== Health Check ====================

// GET /health
func (h *Handlers) HealthCheck(w http.ResponseWriter, r *http.Request) {
	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"status":  "healthy",
		"service": "payvault-api",
		"version": "0.2.0",
	})
}

// ==================== Helpers ====================

func parsePagination(r *http.Request) (int, int) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
