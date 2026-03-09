package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"payvault-api/internal/services"
)

// AuthMiddleware provides JWT and API-key authentication handlers.
type AuthMiddleware struct {
	jwtSecret   string
	authService *services.AuthService
}

// NewAuthMiddleware creates a new AuthMiddleware.
func NewAuthMiddleware(jwtSecret string, authService *services.AuthService) *AuthMiddleware {
	return &AuthMiddleware{jwtSecret: jwtSecret, authService: authService}
}

// RequireJWT is a chi middleware that authenticates requests using JWT Bearer tokens.
// Used for dashboard/merchant portal endpoints.
func (am *AuthMiddleware) RequireJWT(next http.Handler) http.Handler {
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
			return []byte(am.jwtSecret), nil
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

		merchantID, _ := claims["sub"].(string)
		if merchantID == "" {
			writeError(w, http.StatusUnauthorized, "invalid merchant ID in token")
			return
		}

		ctx := context.WithValue(r.Context(), ContextMerchantID, merchantID)
		ctx = context.WithValue(ctx, ContextAuthMethod, "jwt")
		ctx = context.WithValue(ctx, ContextEnvironment, "live")

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAPIKey is a chi middleware that authenticates requests using PayVault API keys.
// Used for SDK-facing endpoints. Accepts both pk_* and sk_* keys.
func (am *AuthMiddleware) RequireAPIKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		rawKey := strings.TrimPrefix(authHeader, "Bearer ")
		if rawKey == authHeader {
			writeError(w, http.StatusUnauthorized, "invalid authorization format, use: Bearer <api_key>")
			return
		}

		merchantID, env, isSecret, err := am.authService.ValidateAPIKey(r.Context(), rawKey)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or inactive API key")
			return
		}

		ctx := context.WithValue(r.Context(), ContextMerchantID, merchantID)
		ctx = context.WithValue(ctx, ContextEnvironment, env)
		ctx = context.WithValue(ctx, ContextIsSecretKey, isSecret)
		ctx = context.WithValue(ctx, ContextAuthMethod, "api_key")

		// Set test mode flag for downstream services
		if env == "test" {
			ctx = context.WithValue(ctx, contextKey("test_mode"), true)
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireSecretKey middleware ensures the request was made with a secret key (sk_*).
// Must be used AFTER RequireAPIKey.
func (am *AuthMiddleware) RequireSecretKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isSecret, _ := r.Context().Value(ContextIsSecretKey).(bool)
		if !isSecret {
			writeError(w, http.StatusForbidden, "this endpoint requires a secret key (sk_*)")
			return
		}
		next.ServeHTTP(w, r)
	})
}
