package api

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #020617;
            --card-bg: #0f172a;
            --card-border: #1e293b;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --success: #10b981;
            --input-bg: #020617;
        }
        * {
            box-sizing: border-box;
            -webkit-font-smoothing: antialiased;
        }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: var(--bg);
            color: var(--text-primary);
            font-family: 'Outfit', sans-serif;
        }
        .card {
            width: 100%;
            max-width: 440px;
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .header {
            padding: 32px 32px 24px;
            text-align: center;
        }
        .brand-icon {
            width: 48px;
            height: 48px;
            background: var(--primary);
            color: white;
            border-radius: 14px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 20px;
            margin-bottom: 20px;
            box-shadow: 0 0 20px rgba(79, 70, 229, 0.4);
        }
        h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.02em;
        }
        .description {
            margin: 8px 0 0;
            color: var(--text-secondary);
            font-size: 15px;
            line-height: 1.6;
        }
        .amount-section {
            margin: 24px 32px;
            padding: 20px;
            background: rgba(2, 6, 23, 0.5);
            border: 1px solid var(--card-border);
            border-radius: 16px;
            text-align: center;
        }
        .amount-label {
            display: block;
            color: var(--text-secondary);
            font-size: 13px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }
        .amount-value {
            font-size: 32px;
            font-weight: 700;
            color: var(--text-primary);
            letter-spacing: -0.03em;
        }
        .form-container {
            padding: 0 32px 32px;
        }
        form {
            display: grid;
            gap: 20px;
        }
        .field-group {
            display: grid;
            gap: 8px;
        }
        label {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-secondary);
        }
        .input-wrapper {
            position: relative;
        }
        input {
            width: 100%;
            height: 52px;
            padding: 0 16px;
            background: var(--input-bg);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            color: white;
            font-family: inherit;
            font-size: 16px;
            transition: all 0.2s ease;
            outline: none;
        }
        input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
        }
        input::placeholder {
            color: #475569;
        }
        .currency-prefix {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-secondary);
            font-weight: 600;
        }
        input.with-prefix {
            padding-left: 56px;
        }
        .btn-pay {
            width: 100%;
            height: 56px;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 14px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-top: 8px;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
        }
        .btn-pay:hover:not(:disabled) {
            background: var(--primary-hover);
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
        }
        .btn-pay:active:not(:disabled) {
            transform: translateY(0);
        }
        .btn-pay:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .error-message {
            margin-top: 12px;
            color: #ef4444;
            font-size: 14px;
            text-align: center;
            min-height: 20px;
            font-weight: 500;
        }
        .footer {
            padding: 20px;
            text-align: center;
            border-top: 1px solid var(--card-border);
            background: rgba(2, 6, 23, 0.2);
        }
        .footer p {
            margin: 0;
            font-size: 13px;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .footer svg {
            color: var(--success);
        }
        .footer strong {
            color: var(--text-primary);
        }
        
        /* Skeleton/Loading State */
        .processing-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .7; }
        }
    </style>
</head>
<body>
    <main class="card">
        <div class="header">
            <div class="brand-icon">PV</div>
            <h1>{{.Name}}</h1>
            {{if .Description}}<p class="description">{{.Description}}</p>{{end}}
        </div>

        {{if eq .LinkType "fixed"}}
        <div class="amount-section">
            <span class="amount-label">You pay</span>
            <div class="amount-value">{{.DisplayAmount}}</div>
        </div>
        {{end}}

        <div class="form-container">
            <form id="checkout-form">
                {{if eq .LinkType "flexible"}}
                <div class="field-group">
                    <label for="amount">Amount to pay</label>
                    <div class="input-wrapper">
                        <span class="currency-prefix">{{if .Currency}}{{.Currency}}{{else}}NGN{{end}}</span>
                        <input id="amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0.00" required class="with-prefix">
                    </div>
                </div>
                {{end}}

                <div class="field-group">
                    <label for="email">Email Address</label>
                    <div class="input-wrapper">
                        <input id="email" name="email" type="email" autocomplete="email" placeholder="alex@example.com" required>
                    </div>
                </div>

                <div id="error-msg" class="error-message" role="alert" aria-live="polite"></div>

                <button id="pay-btn" class="btn-pay" type="submit">
                    {{if eq .LinkType "fixed"}}Pay {{.DisplayAmount}}{{else}}Proceed to Payment{{end}}
                </button>
            </form>
        </div>

        <div class="footer">
            <p>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                Secured by <strong>PayVault</strong>
            </p>
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
            btn.innerHTML = '<span class="processing-pulse">Processing...</span>';
            errorEl.textContent = '';

            const email = document.getElementById('email').value.trim();
            const body = { email };

            {{if eq .LinkType "flexible"}}
            const amountInput = document.getElementById('amount').value;
            const parsedAmount = parseFloat(amountInput);
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                errorEl.textContent = 'Please enter a valid amount.';
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
                errorEl.textContent = json.error || 'Payment initiation failed.';
            } catch (err) {
                errorEl.textContent = 'Connection error. Check your internet.';
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #020617;
            color: #f8fafc;
            font-family: 'Outfit', sans-serif;
        }
        .card {
            width: 100%;
            max-width: 400px;
            padding: 48px 32px;
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 24px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .icon-box {
            width: 64px;
            height: 64px;
            margin: 0 auto 24px;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #1e293b;
            color: #64748b;
        }
        h1 {
            margin: 0 0 12px;
            font-size: 22px;
            font-weight: 700;
        }
        p {
            margin: 0;
            color: #94a3b8;
            line-height: 1.6;
            font-size: 15px;
        }
        .btn-back {
            display: inline-block;
            margin-top: 32px;
            padding: 12px 24px;
            background: #334155;
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s ease;
        }
        .btn-back:hover {
            background: #475569;
        }
    </style>
</head>
<body>
    <main class="card">
        <div class="icon-box">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
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

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	provider := strings.TrimSpace(r.URL.Query().Get("provider"))
	currency := strings.TrimSpace(r.URL.Query().Get("currency"))

	log.Printf("[DEBUG] ListTransactions request: merchant=%s, limit=%d, offset=%d, status=%s, provider=%s, currency=%s",
		merchantID, limit, offset, status, provider, currency)

	txns, total, err := h.transaction.ListTransactions(r.Context(), merchantID, limit, offset, status, provider, currency)
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
func (h *Handlers) DeletePaymentLink(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	linkID := chi.URLParam(r, "id")

	if err := h.links.SoftDeleteLink(r.Context(), merchantID, linkID); err != nil {
		middleware.ErrorResponse(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{"message": "Payment link deleted"})
}

// POST /api/v1/dashboard/links/{id}/deactivate
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
