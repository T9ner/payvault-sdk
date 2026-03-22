package services

import (
	"encoding/hex"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ── GenerateJWT ─────────────────────────────────────────────────

func TestGenerateJWT_ReturnsValidToken(t *testing.T) {
	secret := "test-secret-key-for-jwt-signing"
	svc := &AuthService{jwtSecret: secret}

	token, err := svc.GenerateJWT("merchant-uuid-123", "user@example.com")
	if err != nil {
		t.Fatalf("GenerateJWT returned error: %v", err)
	}
	if token == "" {
		t.Fatal("GenerateJWT returned empty token")
	}

	// Parse the token back using the same secret
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		t.Fatalf("failed to parse generated JWT: %v", err)
	}
	if !parsed.Valid {
		t.Fatal("generated JWT is not valid")
	}
}

func TestGenerateJWT_ContainsCorrectClaims(t *testing.T) {
	secret := "test-secret-key-for-jwt-signing"
	svc := &AuthService{jwtSecret: secret}

	token, err := svc.GenerateJWT("merchant-uuid-123", "user@example.com")
	if err != nil {
		t.Fatalf("GenerateJWT returned error: %v", err)
	}

	parsed, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		t.Fatalf("failed to parse JWT: %v", err)
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatal("claims are not MapClaims")
	}

	// Check sub claim
	sub, _ := claims["sub"].(string)
	if sub != "merchant-uuid-123" {
		t.Errorf("sub = %q, want %q", sub, "merchant-uuid-123")
	}

	// Check email claim
	email, _ := claims["email"].(string)
	if email != "user@example.com" {
		t.Errorf("email = %q, want %q", email, "user@example.com")
	}

	// Check exp is roughly 24h from now
	exp, _ := claims["exp"].(float64)
	expectedExp := time.Now().Add(24 * time.Hour).Unix()
	if diff := int64(exp) - expectedExp; diff > 5 || diff < -5 {
		t.Errorf("exp is not ~24h from now: got %v, expected ~%v", int64(exp), expectedExp)
	}

	// Check iat is roughly now
	iat, _ := claims["iat"].(float64)
	now := time.Now().Unix()
	if diff := int64(iat) - now; diff > 5 || diff < -5 {
		t.Errorf("iat is not ~now: got %v, expected ~%v", int64(iat), now)
	}
}

func TestGenerateJWT_UsesHS256(t *testing.T) {
	secret := "test-secret-key-for-jwt-signing"
	svc := &AuthService{jwtSecret: secret}

	tokenStr, err := svc.GenerateJWT("id", "e@x.com")
	if err != nil {
		t.Fatalf("GenerateJWT returned error: %v", err)
	}

	parsed, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		t.Fatalf("failed to parse JWT: %v", err)
	}

	if parsed.Method.Alg() != "HS256" {
		t.Errorf("signing method = %q, want HS256", parsed.Method.Alg())
	}
}

// ── extractPrefix ───────────────────────────────────────────────

func TestExtractPrefix(t *testing.T) {
	tests := []struct {
		name   string
		key    string
		expect string
	}{
		{"live secret key", "sk_live_abc123def456", "sk_live"},
		{"test secret key", "sk_test_xyz789", "sk_test"},
		{"live public key", "pk_live_abc123def456", "pk_live"},
		{"test public key", "pk_test_xyz789", "pk_test"},
		{"too short", "sk_li", ""},
		{"no underscores", "abcdefghij", ""},
		{"one underscore", "sk_nothingelse", ""},
		{"empty string", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractPrefix(tt.key)
			if got != tt.expect {
				t.Errorf("extractPrefix(%q) = %q, want %q", tt.key, got, tt.expect)
			}
		})
	}
}

// ── generateRandomAPIKey ────────────────────────────────────────

func TestGenerateRandomAPIKey_Uniqueness(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		key, err := generateRandomAPIKey(32)
		if err != nil {
			t.Fatalf("generateRandomAPIKey returned error: %v", err)
		}
		if _, exists := seen[key]; exists {
			t.Fatalf("duplicate key generated at iteration %d", i)
		}
		seen[key] = struct{}{}
	}
}

func TestGenerateRandomAPIKey_Length(t *testing.T) {
	key, err := generateRandomAPIKey(32)
	if err != nil {
		t.Fatalf("generateRandomAPIKey returned error: %v", err)
	}
	// 32 bytes → 64 hex characters
	if len(key) != 64 {
		t.Errorf("key length = %d, want 64", len(key))
	}
}

func TestGenerateRandomAPIKey_IsValidHex(t *testing.T) {
	key, err := generateRandomAPIKey(16)
	if err != nil {
		t.Fatalf("generateRandomAPIKey returned error: %v", err)
	}
	_, err = hex.DecodeString(key)
	if err != nil {
		t.Errorf("key is not valid hex: %q", key)
	}
}
