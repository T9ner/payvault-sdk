package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/T9ner/payvault-api/internal/config"
	"github.com/T9ner/payvault-api/internal/services"
)

// Context keys for storing auth info in request context.
type contextKey string

const (
	ContextMerchantID  contextKey = "merchant_id"
	ContextEnvironment contextKey = "environment"
	ContextIsSecretKey contextKey = "is_secret_key"
	ContextAuthMethod  contextKey = "auth_method" // "jwt" or "api_key"
)

// GetMerchantID extracts the merchant ID from the request context.
func GetMerchantID(ctx context.Context) uuid.UUID {
	id, _ := ctx.Value(ContextMerchantID).(uuid.UUID)
	return id
}

// GetEnvironment extracts the API environment from the request context.
func GetEnvironment(ctx context.Context) string {
	env, _ := ctx.Value(ContextEnvironment).(string)
	if env == "" {
		return "test"
	}
	return env
}

// JWTAuth middleware authenticates requests using JWT Bearer tokens.
// Used for dashboard/merchant portal endpoints.
func JWTAuth(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeError(w, http.StatusUnauthorized, "missing authorization header")
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenStr == authHeader {
				writeError(w, http.StatusUnauthorized, "invalid authorization format")
				return
			}

			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(cfg.JWTSecret), nil
			})
			if err != nil || !token.Valid {
				writeError(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				writeError(w, http.StatusUnauthorized, "invalid token claims")
				return
			}

			subStr, _ := claims["sub"].(string)
			merchantID, err := uuid.Parse(subStr)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "invalid merchant ID in token")
				return
			}

			ctx := context.WithValue(r.Context(), ContextMerchantID, merchantID)
			ctx = context.WithValue(ctx, ContextAuthMethod, "jwt")
			ctx = context.WithValue(ctx, ContextEnvironment, "live") // JWT defaults to live

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// APIKeyAuth middleware authenticates requests using PayVault API keys.
// Used for SDK-facing endpoints. Accepts both pk_* and sk_* keys.
func APIKeyAuth(authService *services.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeError(w, http.StatusUnauthorized, "missing authorization header")
				return
			}

			// Accept "Bearer sk_live_xxx" format
			rawKey := strings.TrimPrefix(authHeader, "Bearer ")
			if rawKey == authHeader {
				writeError(w, http.StatusUnauthorized, "invalid authorization format, use: Bearer <api_key>")
				return
			}

			merchantID, env, isSecret, err := authService.ValidateAPIKey(r.Context(), rawKey)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "invalid or inactive API key")
				return
			}

			ctx := context.WithValue(r.Context(), ContextMerchantID, merchantID)
			ctx = context.WithValue(ctx, ContextEnvironment, env)
			ctx = context.WithValue(ctx, ContextIsSecretKey, isSecret)
			ctx = context.WithValue(ctx, ContextAuthMethod, "api_key")

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SecretKeyRequired middleware ensures the request was made with a secret key (sk_*).
// Must be used AFTER APIKeyAuth.
func SecretKeyRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isSecret, _ := r.Context().Value(ContextIsSecretKey).(bool)
		if !isSecret {
			writeError(w, http.StatusForbidden, "this endpoint requires a secret key (sk_*)")
			return
		}
		next.ServeHTTP(w, r)
	})
}
