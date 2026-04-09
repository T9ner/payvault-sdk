package api

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jackc/pgx/v5/pgxpool"
	"payvault-api/internal/config"
	"payvault-api/internal/middleware"
	"payvault-api/internal/services"
)

// Handlers holds all HTTP handler dependencies.
type Handlers struct {
	db          *pgxpool.Pool
	auth        *services.AuthService
	transaction *services.TransactionService
	providers   *services.ProviderRegistry
	crypto      *services.CryptoService
	links       *services.PaymentLinkService
	subs        *services.SubscriptionService
	fraud       *services.FraudService
	webhookDlv  *services.WebhookDeliveryService
	status      *services.StatusService
	config      *config.Config
	settings    *services.SettingsService
	analytics   *services.AnalyticsService
}

type checkoutPageData struct {
	Slug          string
	Name          string
	Description   string
	LinkType      string
	Amount        int64
	Currency      string
	DisplayAmount string
}

var checkoutTmpl = template.Must(template.New("checkout").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.Name}} · PayVault</title>
    <style>
        :root {
            color-scheme: dark;
        }
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #0f0f0f;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .card {
            width: 100%;
            max-width: 400px;
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 20px 24px;
            border-bottom: 1px solid #2a2a2a;
        }
        .brand-mark {
            width: 36px;
            height: 36px;
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #f5a623;
            color: #0f0f0f;
            font-weight: 800;
            letter-spacing: 0.04em;
        }
        .brand-text {
            font-size: 1.1rem;
            font-weight: 700;
        }
        .content {
            padding: 24px;
        }
        h1 {
            margin: 0 0 8px;
            font-size: 1.5rem;
            line-height: 1.2;
        }
        .description {
            margin: 0 0 24px;
            color: #a0a0a0;
            line-height: 1.5;
            white-space: pre-wrap;
        }
        .amount-display {
            margin: 0 0 24px;
            padding: 14px 16px;
            border: 1px solid #2a2a2a;
            border-radius: 14px;
            background: #141414;
        }
        .amount-label {
            display: block;
            margin-bottom: 6px;
            color: #a0a0a0;
            font-size: 0.9rem;
        }
        .amount-value {
            font-size: 1.4rem;
            font-weight: 700;
            color: #f5a623;
        }
        form {
            display: grid;
            gap: 16px;
        }
        label {
            display: grid;
            gap: 8px;
            font-size: 0.95rem;
            font-weight: 600;
        }
        input {
            width: 100%;
            padding: 14px 16px;
            border: 1px solid #2a2a2a;
            border-radius: 14px;
            background: #141414;
            color: #ffffff;
            font: inherit;
            outline: none;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        input:focus {
            border-color: #f5a623;
            box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.15);
        }
        input::placeholder {
            color: #666666;
        }
        .hint {
            color: #a0a0a0;
            font-size: 0.85rem;
        }
        button {
            width: 100%;
            padding: 14px 16px;
            border: 0;
            border-radius: 14px;
            background: #f5a623;
            color: #0f0f0f;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        button:hover:not(:disabled) {
            transform: translateY(-1px);
        }
        button:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
        }
        .error {
            min-height: 20px;
            color: #ff7b72;
            font-size: 0.92rem;
        }
        .footer {
            margin-top: 20px;
            color: #a0a0a0;
            font-size: 0.9rem;
            text-align: center;
        }
        .footer strong {
            color: #ffffff;
        }
    </style>
</head>
<body>
    <main class="card">
        <div class="brand">
            <div class="brand-mark">PV</div>
            <div class="brand-text">PayVault</div>
        </div>
        <div class="content">
            <h1>{{.Name}}</h1>
            {{if .Description}}<p class="description">{{.Description}}</p>{{end}}
            {{if eq .LinkType "fixed"}}
            <div class="amount-display">
                <span class="amount-label">Amount</span>
                <div class="amount-value">{{.DisplayAmount}}</div>
            </div>
            {{end}}
            <form id="checkout-form">
                {{if eq .LinkType "flexible"}}
                <label for="amount">
                    Amount ({{if .Currency}}{{.Currency}}{{else}}NGN{{end}})
                    <input id="amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="Enter amount" required>
                    <span class="hint">Enter the amount in major units.</span>
                </label>
                {{end}}
                <label for="email">
                    Customer Email
                    <input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
                </label>
                <button id="pay-btn" type="submit">{{if eq .LinkType "fixed"}}Pay {{.DisplayAmount}}{{else}}Continue to payment{{end}}</button>
                <div id="error-msg" class="error" role="alert" aria-live="polite"></div>
            </form>
            <div class="footer">🔒 Secured by <strong>PayVault</strong></div>
        </div>
    </main>
    <script>
        const form = document.getElementById('checkout-form');
        const btn = document.getElementById('pay-btn');
        const errorEl = document.getElementById('error-msg');
        const payBtnText = btn.textContent;

        form.addEventListener('submit', async function handlePay(e) {
            e.preventDefault();
            btn.disabled = true;
            btn.textContent = 'Processing...';
            errorEl.textContent = '';

            const email = document.getElementById('email').value.trim();
            const body = { email };

            {{if eq .LinkType "flexible"}}
            const amountInput = document.getElementById('amount').value;
            const parsedAmount = parseFloat(amountInput);
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                errorEl.textContent = 'Enter a valid amount.';
                btn.disabled = false;
                btn.textContent = payBtnText;
                return;
            }
            body.amount = Math.round(parsedAmount * 100);
            {{end}}

            try {
                const res = await fetch('/api/v1/checkout/{{.Slug}}/pay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (json.success && json.data && json.data.authorization_url) {
                    window.location.href = json.data.authorization_url;
                    return;
                }
                errorEl.textContent = json.error || 'Payment failed. Please try again.';
            } catch (err) {
                errorEl.textContent = 'Network error. Please try again.';
            }

            btn.disabled = false;
            btn.textContent = payBtnText;
        });
    </script>
</body>
</html>`))

var checkoutErrorTmpl = template.Must(template.New("checkout-error").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Checkout unavailable · PayVault</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #0f0f0f;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .card {
            width: 100%;
            max-width: 400px;
            padding: 32px 24px;
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }
        .brand {
            width: 48px;
            height: 48px;
            margin: 0 auto 18px;
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #f5a623;
            color: #0f0f0f;
            font-weight: 800;
        }
        h1 {
            margin: 0 0 10px;
            font-size: 1.5rem;
        }
        p {
            margin: 0;
            color: #a0a0a0;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <main class="card">
        <div class="brand">PV</div>
        <h1>Checkout unavailable</h1>
        <p>{{.}}</p>
    </main>
</body>
</html>`))

func NewHandlers(
	db *pgxpool.Pool,
	auth *services.AuthService,
	txn *services.TransactionService,
	providers *services.ProviderRegistry,
	crypto *services.CryptoService,
	links *services.PaymentLinkService,
	subs *services.SubscriptionService,
	fraud *services.FraudService,
	webhookDlv *services.WebhookDeliveryService,
	status *services.StatusService,
	cfg *config.Config,
	settings *services.SettingsService,
	analytics *services.AnalyticsService,
) *Handlers {
	return &Handlers{
		db:          db,
		auth:        auth,
		transaction: txn,
		providers:   providers,
		crypto:      crypto,
		links:       links,
		subs:        subs,
		fraud:       fraud,
		webhookDlv:  webhookDlv,
		status:      status,
		config:      cfg,
		settings:    settings,
		analytics:   analytics,
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

// Legacy handlers removed

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
		"items": txns,
		"total": total,
		"limit": limit,
		"page":  (offset / limit) + 1,
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
		"items": links,
		"total": total,
		"limit": limit,
		"page":  (offset / limit) + 1,
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
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		if tplErr := checkoutErrorTmpl.Execute(w, strings.TrimSpace(err.Error())); tplErr != nil {
			http.Error(w, "Checkout unavailable", http.StatusNotFound)
		}
		return
	}

	var amountKobo int64
	if link.Amount != nil {
		amountKobo = *link.Amount
	}

	data := checkoutPageData{
		Slug:          slug,
		Name:          link.Name,
		Description:   link.Description,
		LinkType:      link.LinkType,
		Amount:        amountKobo,
		Currency:      link.Currency,
		DisplayAmount: formatCheckoutAmount(amountKobo, link.Currency),
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := checkoutTmpl.Execute(w, data); err != nil {
		http.Error(w, "Failed to render checkout page", http.StatusInternalServerError)
	}
}

func formatCheckoutAmount(amount int64, currency string) string {
	symbol := "₦"
	switch strings.ToUpper(currency) {
	case "", "NGN":
		symbol = "₦"
	case "USD":
		symbol = "$"
	default:
		symbol = strings.ToUpper(currency) + " "
	}

	major := amount / 100
	minor := amount % 100
	return fmt.Sprintf("%s%s.%02d", symbol, formatCheckoutInteger(major), minor)
}

func formatCheckoutInteger(amount int64) string {
	digits := strconv.FormatInt(amount, 10)
	if len(digits) <= 3 {
		return digits
	}

	var b strings.Builder
	firstGroup := len(digits) % 3
	if firstGroup == 0 {
		firstGroup = 3
	}

	b.WriteString(digits[:firstGroup])
	for i := firstGroup; i < len(digits); i += 3 {
		b.WriteString(",")
		b.WriteString(digits[i : i+3])
	}

	return b.String()
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

// ==================== Fraud Handlers ====================

// PUT /api/v1/dashboard/fraud/rules
func (h *Handlers) UpsertFraudRule(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.UpsertFraudRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.RuleType == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "rule_type is required")
		return
	}

	rule, err := h.fraud.UpsertFraudRule(r.Context(), merchantID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, rule)
}

// GET /api/v1/dashboard/fraud/rules
func (h *Handlers) ListFraudRules(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	rules, err := h.fraud.ListFraudRules(r.Context(), merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, rules)
}

// GET /api/v1/dashboard/fraud/events
func (h *Handlers) ListFraudEvents(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	events, err := h.fraud.ListFraudEvents(r.Context(), merchantID, limit)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, events)
}

// ==================== Webhook Log Handlers ====================

// GET /api/v1/dashboard/webhooks/logs
func (h *Handlers) ListWebhookLogs(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	limit, offset := parsePagination(r)

	entries, total, err := h.webhookDlv.ListWebhookLogs(r.Context(), merchantID, limit, offset)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"items": entries,
		"total": total,
		"limit": limit,
		"page":  (offset / limit) + 1,
	})
}

// POST /api/v1/dashboard/webhooks/logs/{id}/retry
func (h *Handlers) RetryWebhook(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	webhookID := chi.URLParam(r, "id")

	log, err := h.webhookDlv.RetryWebhook(r.Context(), merchantID, webhookID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, log)
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

	// 2.5 Extract Subscription specific details
	subCode, subEvent := extractSubscriptionData(event, providerName)
	if subCode != "" {
		_ = h.subs.ProcessWebhook(r.Context(), subCode, subEvent)
		w.WriteHeader(http.StatusOK)
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

// extractSubscriptionData finds the provider_subscription_id and the event type
func extractSubscriptionData(event map[string]interface{}, provider string) (string, string) {
	switch provider {
	case "paystack":
		eventType, _ := event["event"].(string)
		data, _ := event["data"].(map[string]interface{})

		// If data has subscription_code directly (subscription.create, etc.)
		if subCode, ok := data["subscription_code"].(string); ok && subCode != "" {
			return subCode, eventType
		}

		// If it's a charge webhook containing a plan object
		if plan, ok := data["plan"].(map[string]interface{}); ok {
			if subCode, ok := plan["subscription_code"].(string); ok && subCode != "" {
				return subCode, eventType
			}
		}
	}
	// Fallback to empty
	return "", ""
}

// ==================== Status Handlers (Webhook-Free DX) ====================

// GET /api/v1/payments/status/{reference}
func (h *Handlers) GetTransactionStatus(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	merchantUUID, err := uuid.Parse(merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "invalid merchant ID")
		return
	}
	reference := chi.URLParam(r, "reference")

	status, err := h.status.GetStatus(r.Context(), merchantUUID, reference)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, status)
}

// GET /api/v1/payments/status/{reference}/wait
func (h *Handlers) WaitForStatus(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	merchantUUID, err := uuid.Parse(merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "invalid merchant ID")
		return
	}
	reference := chi.URLParam(r, "reference")

	timeoutSec := 30
	if t := r.URL.Query().Get("timeout"); t != "" {
		if parsed, err := strconv.Atoi(t); err == nil && parsed > 0 && parsed <= 30 {
			timeoutSec = parsed
		}
	}

	status, timedOut, err := h.status.WaitForStatus(
		r.Context(), merchantUUID, reference,
		time.Duration(timeoutSec)*time.Second,
	)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"status":    status,
		"timed_out": timedOut,
	})
}

// POST /api/v1/payments/status/batch
func (h *Handlers) BatchStatus(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	merchantUUID, err := uuid.Parse(merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "invalid merchant ID")
		return
	}

	var input struct {
		References []string `json:"references"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(input.References) == 0 {
		middleware.ErrorResponse(w, http.StatusBadRequest, "references array is required")
		return
	}

	statuses, err := h.status.GetBatchStatus(r.Context(), merchantUUID, input.References)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"statuses": statuses,
		"count":    len(statuses),
	})
}

// GET /api/v1/payments/activity
func (h *Handlers) RecentActivity(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	merchantUUID, err := uuid.Parse(merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "invalid merchant ID")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	transitions, err := h.status.RecentTransitions(r.Context(), merchantUUID, limit)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"transactions": transitions,
		"count":        len(transitions),
	})
}

// ==================== Health Check ====================

// GET /health
func (h *Handlers) HealthCheck(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status":  "healthy",
		"service": "payvault-api",
		"version": "0.2.0",
	}

	// Readiness check: ping the existing pool instead of creating a new one
	if h.db != nil {
		if err := h.db.Ping(r.Context()); err != nil {
			health["status"] = "degraded"
			health["db"] = "unresponsive"
		} else {
			health["db"] = "ok"
		}
	}

	middleware.JSONResponse(w, http.StatusOK, health)
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

// ==================== Settings Handlers ====================

// POST /api/v1/dashboard/api-keys
func (h *Handlers) GenerateAPIKey(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	key, err := h.settings.GenerateAPIKey(r.Context(), merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, key)
}

// GET /api/v1/dashboard/api-keys
func (h *Handlers) ListAPIKeys(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	keys, err := h.settings.ListAPIKeys(r.Context(), merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"items": keys,
	})
}

// POST /api/v1/dashboard/providers
func (h *Handlers) SaveProviderCredentials(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.SaveProviderCredentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if input.Provider == "" || input.SecretKey == "" {
		middleware.ErrorResponse(w, http.StatusBadRequest, "provider and secret_key are required")
		return
	}

	if err := h.settings.SaveProviderCredentials(r.Context(), merchantID, input); err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{"message": "credentials saved safely"})
}
