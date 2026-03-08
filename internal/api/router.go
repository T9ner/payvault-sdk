package api

import (
	"net/http"

	"payvault-api/internal/middleware"
	"payvault-api/internal/services"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

// NewRouter builds the complete HTTP router with all routes and middleware.
func NewRouter(
	auth *services.AuthService,
	txn *services.TransactionService,
	providers *services.ProviderRegistry,
	crypto *services.CryptoService,
	rateLimiter *middleware.RateLimiter,
) http.Handler {
	r := chi.NewRouter()
	h := NewHandlers(auth, txn, providers, crypto)

	// ==================== Global Middleware ====================
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.RequestLogger)
	r.Use(chimw.Recoverer)
	r.Use(corsMiddleware)

	// ==================== Health ====================
	r.Get("/health", h.HealthCheck)

	// ==================== API v1 ====================
	r.Route("/api/v1", func(r chi.Router) {

		// --- Public: Auth (no authentication required) ---
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", h.Register)
			r.Post("/login", h.Login)
		})

		// --- Dashboard: JWT-protected merchant endpoints ---
		r.Route("/dashboard", func(r chi.Router) {
			r.Use(middleware.JWTAuth(auth))

			// API key management
			r.Post("/api-keys", h.GenerateAPIKey)

			// Provider credentials
			r.Post("/providers", h.SaveProviderCredentials)

			// Transaction history (dashboard view)
			r.Get("/transactions", h.ListTransactions)
		})

		// --- SDK/API: API key-protected payment endpoints ---
		r.Route("/payments", func(r chi.Router) {
			r.Use(middleware.APIKeyAuth(auth))
			if rateLimiter != nil {
				r.Use(rateLimiter.Middleware())
			}

			r.Post("/charge", h.InitiateCharge)
			r.Get("/verify/{reference}", h.VerifyTransaction)
			r.Post("/refund", h.RefundTransaction)
			r.Get("/transactions", h.ListTransactions)
		})

		// --- Webhooks: Provider callbacks (no auth -- signature-verified) ---
		r.Route("/webhooks", func(r chi.Router) {
			r.Post("/paystack", h.PaystackWebhook)
			r.Post("/flutterwave", h.FlutterwaveWebhook)
		})
	})

	return r
}

// corsMiddleware adds CORS headers for dashboard frontend.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // Restrict in production
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
