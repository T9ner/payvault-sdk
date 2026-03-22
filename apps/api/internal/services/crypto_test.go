package services

import (
	"encoding/hex"
	"testing"
)

// Generates a valid 32-byte hex key for AES-256
func testHexKey() string {
	// 32 bytes = 64 hex characters
	return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}

// ── Encrypt + Decrypt round-trip ────────────────────────────────

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	svc := NewCryptoService(testHexKey())
	inputs := []string{
		"sk_live_abc123",
		"FLWSECK_TEST-abc123xyz",
		"short",
		"a-very-long-secret-key-that-spans-many-characters-1234567890",
		"", // empty string
	}

	for _, plaintext := range inputs {
		t.Run(plaintext, func(t *testing.T) {
			encrypted, err := svc.Encrypt(plaintext)
			if err != nil {
				t.Fatalf("Encrypt(%q) error: %v", plaintext, err)
			}
			if encrypted == "" {
				t.Fatalf("Encrypt(%q) returned empty string", plaintext)
			}
			if encrypted == plaintext {
				t.Fatal("ciphertext should not equal plaintext")
			}

			decrypted, err := svc.Decrypt(encrypted)
			if err != nil {
				t.Fatalf("Decrypt(%q) error: %v", encrypted, err)
			}
			if decrypted != plaintext {
				t.Errorf("Decrypt(Encrypt(%q)) = %q, want %q", plaintext, decrypted, plaintext)
			}
		})
	}
}

// ── Encrypt produces different output each time (random nonce) ──

func TestEncrypt_ProducesDifferentOutput(t *testing.T) {
	svc := NewCryptoService(testHexKey())
	plaintext := "same-input-every-time"

	enc1, err := svc.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("first Encrypt error: %v", err)
	}
	enc2, err := svc.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("second Encrypt error: %v", err)
	}

	if enc1 == enc2 {
		t.Error("two encryptions of same plaintext should produce different ciphertext (random nonce)")
	}
}

// ── Decrypt with invalid data ───────────────────────────────────

func TestDecrypt_InvalidHex(t *testing.T) {
	svc := NewCryptoService(testHexKey())
	_, err := svc.Decrypt("not-valid-hex!!!")
	if err == nil {
		t.Error("Decrypt with invalid hex should return error")
	}
}

func TestDecrypt_TooShortCiphertext(t *testing.T) {
	svc := NewCryptoService(testHexKey())
	// AES-256-GCM nonce is 12 bytes = 24 hex chars. Give less than that.
	shortHex := hex.EncodeToString([]byte("short"))
	_, err := svc.Decrypt(shortHex)
	if err == nil {
		t.Error("Decrypt with ciphertext shorter than nonce should return error")
	}
}

func TestDecrypt_TamperedCiphertext(t *testing.T) {
	svc := NewCryptoService(testHexKey())
	encrypted, err := svc.Encrypt("original data")
	if err != nil {
		t.Fatalf("Encrypt error: %v", err)
	}

	// Tamper with the ciphertext by flipping last byte
	tampered := encrypted[:len(encrypted)-1] + "0"
	if tampered == encrypted {
		tampered = encrypted[:len(encrypted)-1] + "1"
	}

	_, err = svc.Decrypt(tampered)
	if err == nil {
		t.Error("Decrypt with tampered ciphertext should return error")
	}
}

// ── Invalid key ─────────────────────────────────────────────────

func TestEncrypt_InvalidKey(t *testing.T) {
	svc := NewCryptoService("not-a-valid-hex-key")
	_, err := svc.Encrypt("test")
	if err == nil {
		t.Error("Encrypt with invalid hex key should return error")
	}
}

func TestEncrypt_WrongKeyLength(t *testing.T) {
	// 16 hex chars = 8 bytes, not a valid AES key size (needs 16, 24, or 32 bytes)
	svc := NewCryptoService("0123456789abcdef")
	_, err := svc.Encrypt("test")
	if err == nil {
		t.Error("Encrypt with 8-byte key should return error (AES needs 16/24/32)")
	}
}
