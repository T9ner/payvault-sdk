package services

import (
	"crypto/rand"
	"encoding/hex"
)

// ── Context Keys ─────────────────────────────────────────────────

type contextKey string

const ctxKeyTestMode contextKey = "test_mode"

// ── Utility Functions ────────────────────────────────────────────

// randomHex returns a random hex string of n bytes (2n characters).
func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
