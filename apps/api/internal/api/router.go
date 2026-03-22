package api

import (
	"net/http"

	"payvault-api/internal/middleware"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

// NewRouter builds the full chi router with all routes and middleware.
func NewRouter(h *Handlers, authMW *middleware.AuthMiddleware, rateLimiter *middleware.RateLimiter) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(chimw.RequestID)

	// Health check
	r.Get("/health", h.HealthCheck)

	r.Route("/api/v1", func(r chi.Router) {

		// ── Public & Protected: Auth ──────────────────────────
		r.Route("/auth", func(r chi.Router) {
			// Legacy auth
			r.Post("/register", h.Register)
			r.Post("/login", h.Login)

			// GitHub OAuth
			r.Get("/github", h.GithubLogin)
			r.Get("/github/callback", h.GithubCallback)

			// Protected profile
			r.Group(func(r chi.Router) {
				r.Use(authMW.RequireJWT)
				r.Get("/me", h.GetMe)
			})
		})

		// ── Public: Checkout (payment links) ──────────────────
		// No auth -- these are customer-facing URLs
		r.Route("/checkout", func(r chi.Router) {
			r.Get("/{slug}", h.GetCheckoutPage)       // View payment link details
			r.Post("/{slug}/pay", h.CheckoutPay)       // Initiate payment from link
		})

		// ── Dashboard: JWT-authenticated (merchant admin) ────
		r.Route("/dashboard", func(r chi.Router) {
			r.Use(authMW.RequireJWT)

			// API Keys
			r.Post("/api-keys", h.GenerateAPIKey)

			// Provider credentials
			r.Post("/providers", h.SaveProviderCredentials)

			// Payment Links
			r.Route("/links", func(r chi.Router) {
				r.Post("/", h.CreatePaymentLink)
				r.Get("/", h.ListPaymentLinks)
				r.Delete("/{id}", h.DeactivatePaymentLink)
			})

			// Plans
			r.Route("/plans", func(r chi.Router) {
				r.Get("/", h.ListPlans)
				r.Post("/", h.CreatePlan)
				r.Patch("/{id}", h.UpdatePlan)
				r.Post("/{id}/prices", h.AddPriceToPlan)
				r.Patch("/{plan_id}/prices/{price_id}", h.DeactivatePrice)
			})

			// Subscriptions
			r.Route("/subscriptions", func(r chi.Router) {
				r.Get("/", h.ListSubscriptions)
				r.Get("/{id}", h.GetSubscriptionDetail)
				r.Post("/{id}/cancel", h.CancelSubscription)
				r.Post("/{id}/uncancel", h.UncancelSubscription)
			})

			// Fraud Rules & Events
			r.Route("/fraud", func(r chi.Router) {
				r.Get("/rules", h.ListFraudRules)
				r.Put("/rules", h.UpsertFraudRule)
				r.Get("/events", h.ListFraudEvents)
			})

			// Webhook Delivery Log
			r.Route("/webhooks", func(r chi.Router) {
				r.Get("/logs", h.ListWebhookLogs)
				r.Post("/logs/{id}/retry", h.RetryWebhook)
			})

			// Transactions (Dashboard View)
			r.Route("/transactions", func(r chi.Router) {
				r.Get("/", h.ListTransactions)
				r.Get("/activity", h.RecentActivity)
				r.Post("/charge", h.InitiateCharge) // Create transaction from dashboard
				r.Get("/{reference}/verify", h.VerifyTransaction)
				r.Post("/refund", h.RefundTransaction)
				r.Get("/{reference}/status", h.GetTransactionStatus)
			})
		})

		// ── Payments: API-key authenticated (server-to-server) ─
		r.Route("/payments", func(r chi.Router) {
			r.Use(authMW.RequireAPIKey)
			r.Use(rateLimiter.Limit)

			r.Post("/charge", h.InitiateCharge)
			r.Get("/verify/{reference}", h.VerifyTransaction)
			r.Post("/refund", h.RefundTransaction)
			r.Get("/transactions", h.ListTransactions)

			// Status (webhook-free DX)
			r.Get("/status/{reference}", h.GetTransactionStatus)
			r.Get("/status/{reference}/wait", h.WaitForStatus)
			r.Post("/status/batch", h.BatchStatus)
			r.Get("/activity", h.RecentActivity)
		})

		// ── Public API: API-key authenticated (server-to-server) ─
		r.Route("/public", func(r chi.Router) {
			r.Use(authMW.RequireAPIKey)
			r.Use(rateLimiter.Limit)

			r.Route("/subscriptions", func(r chi.Router) {
				r.Post("/", h.PublicSubscribe)
				r.Get("/", h.PublicListSubscriptions)
				r.Post("/{id}/adjust", h.PublicAdjustSubscription)
				r.Post("/{id}/preview-adjustment", h.PublicPreviewAdjustment)
				r.Post("/{id}/cancel", h.PublicCancelSubscription)
				r.Post("/{id}/uncancel", h.PublicUncancelSubscription)
			})
		})

		// ── Provider Webhooks (signature-verified) ─────────────
		r.Route("/webhooks", func(r chi.Router) {
			r.Post("/paystack", h.PaystackWebhook)
			r.Post("/flutterwave", h.FlutterwaveWebhook)
		})
	})

	return r
}
