package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
)

// ── Context Keys ─────────────────────────────────────────────────
// Single source of truth for all context key types in the services package.

type contextKey string

const (
	ctxKeyTestMode  contextKey = "test_mode"
	ctxKeySecretKey contextKey = "provider_secret_key"
)

// WithSecretKey attaches a provider secret key to the context.
func WithSecretKey(ctx context.Context, key string) context.Context {
	return context.WithValue(ctx, ctxKeySecretKey, key)
}

// ── Utility Functions ────────────────────────────────────────────

// randomHex returns a random hex string of n bytes (2n characters).
func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// getString safely extracts a string from a map.
func getString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}
