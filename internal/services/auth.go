package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ── Errors ────────────────────────────────────────────────────────

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("email already registered")
	ErrMerchantNotFound   = errors.New("merchant not found")
	ErrInvalidAPIKey      = errors.New("invalid or inactive API key")
)

// ── Types ─────────────────────────────────────────────────────────

// Merchant represents a registered merchant (returned to handlers).
type Merchant struct {
	ID           string `json:"id"`
	BusinessName string `json:"business_name"`
	Email        string `json:"email"`
}

// APIKeyPair holds a newly generated public + secret key pair.
type APIKeyPair struct {
	PublicKey string `json:"public_key"`
	SecretKey string `json:"secret_key"`
}

// ── AuthService ──────────────────────────────────────────────────

// AuthService handles merchant registration, login, JWT tokens, API keys,
// and provider credential storage.
type AuthService struct {
	db        *pgxpool.Pool
	jwtSecret string
	crypto    *CryptoService
}

// NewAuthService creates a new AuthService.
// Matches main.go: services.NewAuthService(db, cfg.JWTSecret, cryptoSvc)
func NewAuthService(db *pgxpool.Pool, jwtSecret string, crypto *CryptoService) *AuthService {
	return &AuthService{db: db, jwtSecret: jwtSecret, crypto: crypto}
}

// ── Merchant Registration ────────────────────────────────────────

// RegisterMerchant creates a new merchant account.
// Matches handlers.go: h.auth.RegisterMerchant(ctx, businessName, email, password)
func (s *AuthService) RegisterMerchant(ctx context.Context, businessName, email, password string) (*Merchant, error) {
	// Check if email is taken
	var exists bool
	err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM merchants WHERE email = $1)", email).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check email: %w", err)
	}
	if exists {
		return nil, ErrEmailTaken
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Insert merchant
	var merchant Merchant
	err = s.db.QueryRow(ctx,
		`INSERT INTO merchants (business_name, email, password_hash)
		 VALUES ($1, $2, $3)
		 RETURNING id, business_name, email`,
		businessName, email, string(hash),
	).Scan(&merchant.ID, &merchant.BusinessName, &merchant.Email)
	if err != nil {
		return nil, fmt.Errorf("insert merchant: %w", err)
	}

	return &merchant, nil
}

// ── GitHub OAuth ──────────────────────────────────────────────────

// UpsertGithubMerchant creates or updates a merchant from GitHub OAuth data.
func (s *AuthService) UpsertGithubMerchant(ctx context.Context, githubID int64, username, email, avatarURL string) (*Merchant, error) {
	var merchant Merchant

	// Insert or update based on email matches / github_id
	err := s.db.QueryRow(ctx,
		`INSERT INTO merchants (github_id, business_name, email, avatar_url, role, is_active)
		 VALUES ($1, $2, $3, $4, 'owner', true)
		 ON CONFLICT (email) DO UPDATE SET
			github_id = EXCLUDED.github_id,
			avatar_url = COALESCE(merchants.avatar_url, EXCLUDED.avatar_url),
			business_name = COALESCE(merchants.business_name, EXCLUDED.business_name)
		 RETURNING id, business_name, email`,
		githubID, username, email, avatarURL,
	).Scan(&merchant.ID, &merchant.BusinessName, &merchant.Email)

	if err != nil {
		return nil, fmt.Errorf("upsert github merchant: %w", err)
	}

	return &merchant, nil
}

// ── Login ─────────────────────────────────────────────────────────

// AuthenticateMerchant verifies email/password and returns the merchant.
// Matches handlers.go: h.auth.AuthenticateMerchant(ctx, email, password)
func (s *AuthService) AuthenticateMerchant(ctx context.Context, email, password string) (*Merchant, error) {
	var merchant Merchant
	var passwordHash string

	err := s.db.QueryRow(ctx,
		`SELECT id, business_name, email, password_hash
		 FROM merchants WHERE email = $1 AND is_active = true`,
		email,
	).Scan(&merchant.ID, &merchant.BusinessName, &merchant.Email, &passwordHash)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return &merchant, nil
}

// GetMerchantByID fetches a merchant by UUID.
func (s *AuthService) GetMerchantByID(ctx context.Context, id string) (*Merchant, error) {
	var merchant Merchant
	err := s.db.QueryRow(ctx,
		`SELECT id, business_name, email FROM merchants WHERE id = $1 AND is_active = true`,
		id,
	).Scan(&merchant.ID, &merchant.BusinessName, &merchant.Email)
	if err != nil {
		return nil, ErrMerchantNotFound
	}
	return &merchant, nil
}

// ── JWT ───────────────────────────────────────────────────────────

// GenerateJWT creates a signed JWT token for a merchant.
// Matches handlers.go: h.auth.GenerateJWT(merchant.ID, merchant.Email)
// NOTE: This is PUBLIC (exported) -- handlers call it directly.
func (s *AuthService) GenerateJWT(merchantID, email string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   merchantID,
		"email": email,
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

// ── API Key Generation ───────────────────────────────────────────

// GenerateAPIKeyPair generates pk_<mode>_<random> + sk_<mode>_<random> key pairs.
// Matches handlers.go: h.auth.GenerateAPIKeyPair(ctx, merchantID, mode, label)
func (s *AuthService) GenerateAPIKeyPair(ctx context.Context, merchantID, mode, label string) (*APIKeyPair, error) {
	publicRaw, err := generateRandomAPIKey(32)
	if err != nil {
		return nil, err
	}
	secretRaw, err := generateRandomAPIKey(32)
	if err != nil {
		return nil, err
	}

	publicKey := fmt.Sprintf("pk_%s_%s", mode, publicRaw)
	secretKey := fmt.Sprintf("sk_%s_%s", mode, secretRaw)

	// Hash for storage
	pkHash, _ := bcrypt.GenerateFromPassword([]byte(publicKey), bcrypt.DefaultCost)
	skHash, _ := bcrypt.GenerateFromPassword([]byte(secretKey), bcrypt.DefaultCost)

	// Store public key
	_, err = s.db.Exec(ctx,
		`INSERT INTO api_keys (merchant_id, prefix, key_hash, last_four, environment, is_secret, label)
		 VALUES ($1, $2, $3, $4, $5, false, $6)`,
		merchantID, fmt.Sprintf("pk_%s", mode), string(pkHash), publicKey[len(publicKey)-4:], mode, label,
	)
	if err != nil {
		return nil, fmt.Errorf("store public key: %w", err)
	}

	// Store secret key
	_, err = s.db.Exec(ctx,
		`INSERT INTO api_keys (merchant_id, prefix, key_hash, last_four, environment, is_secret, label)
		 VALUES ($1, $2, $3, $4, $5, true, $6)`,
		merchantID, fmt.Sprintf("sk_%s", mode), string(skHash), secretKey[len(secretKey)-4:], mode, label,
	)
	if err != nil {
		return nil, fmt.Errorf("store secret key: %w", err)
	}

	return &APIKeyPair{PublicKey: publicKey, SecretKey: secretKey}, nil
}

// ValidateAPIKey checks a raw API key against stored hashes.
// Returns (merchantID string, environment string, isSecret bool, error).
// Matches middleware auth.go: am.authService.ValidateAPIKey(ctx, rawKey)
func (s *AuthService) ValidateAPIKey(ctx context.Context, rawKey string) (string, string, bool, error) {
	// Extract prefix to narrow search (e.g., "sk_live" from "sk_live_abc123")
	prefix := extractPrefix(rawKey)
	if prefix == "" {
		return "", "", false, ErrInvalidAPIKey
	}

	rows, err := s.db.Query(ctx,
		`SELECT id, merchant_id, key_hash, environment, is_secret
		 FROM api_keys WHERE prefix = $1 AND is_active = true`, prefix)
	if err != nil {
		return "", "", false, fmt.Errorf("query api keys: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var keyID, merchantID, keyHash, env string
		var isSecret bool

		if err := rows.Scan(&keyID, &merchantID, &keyHash, &env, &isSecret); err != nil {
			continue
		}

		if bcrypt.CompareHashAndPassword([]byte(keyHash), []byte(rawKey)) == nil {
			// Update last_used_at
			_, _ = s.db.Exec(ctx,
				`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, keyID)

			return merchantID, env, isSecret, nil
		}
	}

	return "", "", false, ErrInvalidAPIKey
}

// ── Provider Credentials ─────────────────────────────────────────

// StoreProviderCredentials encrypts and stores a merchant's payment provider keys.
// Matches handlers.go: h.auth.StoreProviderCredentials(ctx, merchantID, provider, secretKey, publicKey)
func (s *AuthService) StoreProviderCredentials(ctx context.Context, merchantID, provider, secretKey, publicKey string) error {
	encSecret, err := s.crypto.Encrypt(secretKey)
	if err != nil {
		return fmt.Errorf("encrypt secret key: %w", err)
	}

	// Store both the encrypted secret key and the public key
	// credential_key format: "paystack_secret_key", "paystack_public_key"
	_, err = s.db.Exec(ctx,
		`INSERT INTO merchant_credentials (merchant_id, credential_key, credential_value)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (merchant_id, credential_key)
		 DO UPDATE SET credential_value = $3, updated_at = NOW()`,
		merchantID, provider+"_secret_key", encSecret,
	)
	if err != nil {
		return fmt.Errorf("store secret key: %w", err)
	}

	if publicKey != "" {
		_, err = s.db.Exec(ctx,
			`INSERT INTO merchant_credentials (merchant_id, credential_key, credential_value)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (merchant_id, credential_key)
			 DO UPDATE SET credential_value = $3, updated_at = NOW()`,
			merchantID, provider+"_public_key", publicKey,
		)
		if err != nil {
			return fmt.Errorf("store public key: %w", err)
		}
	}

	return nil
}

// ── Helpers ──────────────────────────────────────────────────────

func generateRandomAPIKey(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random bytes: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// extractPrefix gets "sk_live" from "sk_live_abc123def..."
func extractPrefix(key string) string {
	// Format: pk_<env>_<random> or sk_<env>_<random>
	if len(key) < 8 {
		return ""
	}
	// Find the second underscore
	count := 0
	for i, c := range key {
		if c == '_' {
			count++
			if count == 2 {
				return key[:i]
			}
		}
	}
	return ""
}
