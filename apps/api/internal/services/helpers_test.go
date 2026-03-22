package services

import (
	"context"
	"testing"
)

// ── getString ───────────────────────────────────────────────────

func TestGetString(t *testing.T) {
	tests := []struct {
		name   string
		m      map[string]interface{}
		key    string
		expect string
	}{
		{"existing key", map[string]interface{}{"name": "John"}, "name", "John"},
		{"missing key", map[string]interface{}{"name": "John"}, "age", ""},
		{"nil map", nil, "key", ""},
		{"non-string value", map[string]interface{}{"count": 42}, "count", ""},
		{"empty string value", map[string]interface{}{"x": ""}, "x", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getString(tt.m, tt.key)
			if got != tt.expect {
				t.Errorf("getString(%v, %q) = %q, want %q", tt.m, tt.key, got, tt.expect)
			}
		})
	}
}

// ── randomHex ───────────────────────────────────────────────────

func TestRandomHex_Length(t *testing.T) {
	// n bytes → 2n hex characters
	got := randomHex(16)
	if len(got) != 32 {
		t.Errorf("randomHex(16) length = %d, want 32", len(got))
	}
}

func TestRandomHex_Uniqueness(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		h := randomHex(16)
		if _, exists := seen[h]; exists {
			t.Fatalf("duplicate at iteration %d", i)
		}
		seen[h] = struct{}{}
	}
}

// ── WithSecretKey context helper ────────────────────────────────

func TestWithSecretKey(t *testing.T) {
	ctx := context.Background()
	ctx = WithSecretKey(ctx, "sk_test_abc123")

	got, ok := ctx.Value(ctxKeySecretKey).(string)
	if !ok {
		t.Fatal("context value is not a string")
	}
	if got != "sk_test_abc123" {
		t.Errorf("got %q, want %q", got, "sk_test_abc123")
	}
}

func TestWithSecretKey_OverwritesPrevious(t *testing.T) {
	ctx := context.Background()
	ctx = WithSecretKey(ctx, "first")
	ctx = WithSecretKey(ctx, "second")

	got, _ := ctx.Value(ctxKeySecretKey).(string)
	if got != "second" {
		t.Errorf("got %q, want %q", got, "second")
	}
}
