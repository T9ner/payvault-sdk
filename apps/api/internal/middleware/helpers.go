package middleware

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ── Context Keys ─────────────────────────────────────────────────

type contextKey string

const (
	ContextMerchantID  contextKey = "merchant_id"
	ContextEnvironment contextKey = "environment"
	ContextIsSecretKey contextKey = "is_secret_key"
	ContextAuthMethod  contextKey = "auth_method"
)

// GetMerchantID extracts the merchant ID as a string from the request context.
// Handlers pass this to service methods which expect string IDs.
func GetMerchantID(ctx context.Context) string {
	// Support both uuid.UUID and string stored in context
	if id, ok := ctx.Value(ContextMerchantID).(uuid.UUID); ok {
		return id.String()
	}
	if id, ok := ctx.Value(ContextMerchantID).(string); ok {
		return id
	}
	return ""
}

// GetEnvironment extracts the API environment from the request context.
func GetEnvironment(ctx context.Context) string {
	env, _ := ctx.Value(ContextEnvironment).(string)
	if env == "" {
		return "test"
	}
	return env
}

// ── Response Helpers ─────────────────────────────────────────────

// ErrorResponse sends a JSON error response. Exported for use by handlers.
func ErrorResponse(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

// JSONResponse sends a JSON success response. Exported for use by handlers.
func JSONResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

// writeError is the internal (unexported) version used by middleware itself.
func writeError(w http.ResponseWriter, status int, message string) {
	ErrorResponse(w, status, message)
}

// ── Request Logger ───────────────────────────────────────────────

// RequestLogger logs incoming requests with method, path, status, and duration.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap response writer to capture status code
		wrapped := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)

		log.Printf("%s %s %d %s",
			r.Method,
			r.URL.Path,
			wrapped.status,
			time.Since(start),
		)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
