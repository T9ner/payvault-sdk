package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type SettingsService struct {
	db     *pgxpool.Pool
	crypto *CryptoService
}

func NewSettingsService(db *pgxpool.Pool, crypto *CryptoService) *SettingsService {
	return &SettingsService{db: db, crypto: crypto}
}

// ── Types ────────────────────────────────────────────────────────

type APIKey struct {
	ID        string    `json:"id,omitempty"`
	Key       string    `json:"key,omitempty"` // Only populated on creation
	Prefix    string    `json:"prefix"`
	CreatedAt time.Time `json:"created_at"`
}

type SaveProviderCredentialsRequest struct {
	Provider  string `json:"provider"`
	SecretKey string `json:"secret_key"`
}

// ── API Keys ─────────────────────────────────────────────────────

// GenerateAPIKey generates a cryptographically random active Bearer token.
// The plaintext token is ONLY returned this one single time!
func (s *SettingsService) GenerateAPIKey(ctx context.Context, merchantID string) (*APIKey, error) {
	// Generate 32 bytes of cryptographically secure random bytes
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return nil, fmt.Errorf("failed generating secure random bytes: %w", err)
	}

	// Format as a hex string with standard prefix
	rawToken := "sk_live_" + hex.EncodeToString(randomBytes)

	// SHA-256 Hash the entire raw key for storage
	hash := sha256.Sum256([]byte(rawToken))
	keyHash := hex.EncodeToString(hash[:])

	// Prefix for visual tracking (e.g. sk_live_1a2b3c)
	prefix := rawToken[:15]

	query := `
		INSERT INTO api_keys (merchant_id, key_hash, key_prefix)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`
	var id string
	var createdAt time.Time
	err := s.db.QueryRow(ctx, query, merchantID, keyHash, prefix).Scan(&id, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed writing key hash to vault: %w", err)
	}

	return &APIKey{
		ID:        id,
		Key:       rawToken, // Plaintext string ONLY returned on creation
		Prefix:    prefix,
		CreatedAt: createdAt,
	}, nil
}

// RevokeAPIKey invalidates an API Key instantly
func (s *SettingsService) RevokeAPIKey(ctx context.Context, merchantID, keyID string) error {
	cmd, err := s.db.Exec(ctx, "UPDATE api_keys SET revoked = true WHERE id = $1 AND merchant_id = $2", keyID, merchantID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return errors.New("key not found or already revoked")
	}
	return nil
}

// ── Provider Credentials ─────────────────────────────────────────

// SaveProviderCredentials encrypts the given 3rd party secret key using AES-256-GCM before writing to the Database
func (s *SettingsService) SaveProviderCredentials(ctx context.Context, merchantID string, req SaveProviderCredentialsRequest) error {
	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider != "paystack" && provider != "flutterwave" && provider != "monnify" && provider != "squad" {
		return errors.New("unsupported provider")
	}

	// Mask the payload completely using the centralized server encryption
	encryptedSecret, err := s.crypto.Encrypt(req.SecretKey)
	if err != nil {
		return fmt.Errorf("failed AES-256 encryption: %w", err)
	}

	query := `
		INSERT INTO provider_credentials (merchant_id, provider, encrypted_secret)
		VALUES ($1, $2, $3)
		ON CONFLICT (merchant_id, provider)
		DO UPDATE SET encrypted_secret = $3, updated_at = NOW()
	`
	_, err = s.db.Exec(ctx, query, merchantID, provider, encryptedSecret)
	return err
}
