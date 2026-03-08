package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/T9ner/payvault-api/internal/config"
	"github.com/T9ner/payvault-api/internal/models"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("email already registered")
	ErrMerchantNotFound   = errors.New("merchant not found")
	ErrInvalidAPIKey      = errors.New("invalid or inactive API key")
)

type AuthService struct {
	db  *pgxpool.Pool
	cfg *config.Config
}

func NewAuthService(db *pgxpool.Pool, cfg *config.Config) *AuthService {
	return &AuthService{db: db, cfg: cfg}
}

// ── Merchant Registration ────────────────────────────────────────

func (s *AuthService) Register(ctx context.Context, req models.RegisterRequest) (*models.AuthResponse, error) {
	// Check if email is taken
	var exists bool
	err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM merchants WHERE email = $1)", req.Email).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check email: %w", err)
	}
	if exists {
		return nil, ErrEmailTaken
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Insert merchant
	merchant := &models.Merchant{}
	err = s.db.QueryRow(ctx,
		`INSERT INTO merchants (email, password_hash, business_name, business_url)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email, business_name, business_url, role, is_active, created_at, updated_at`,
		req.Email, string(hash), req.BusinessName, nilIfEmpty(req.BusinessURL),
	).Scan(
		&merchant.ID, &merchant.Email, &merchant.BusinessName, &merchant.BusinessURL,
		&merchant.Role, &merchant.IsActive, &merchant.CreatedAt, &merchant.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert merchant: %w", err)
	}

	// Create default settings
	_, err = s.db.Exec(ctx,
		`INSERT INTO merchant_settings (merchant_id) VALUES ($1)`, merchant.ID)
	if err != nil {
		return nil, fmt.Errorf("create settings: %w", err)
	}

	// Generate JWT
	token, err := s.generateJWT(merchant.ID, merchant.Email)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{Token: token, Merchant: merchant}, nil
}

// ── Login ─────────────────────────────────────────────────────────

func (s *AuthService) Login(ctx context.Context, req models.LoginRequest) (*models.AuthResponse, error) {
	merchant := &models.Merchant{}
	err := s.db.QueryRow(ctx,
		`SELECT id, email, password_hash, business_name, business_url, role, is_active, created_at, updated_at
		 FROM merchants WHERE email = $1 AND is_active = true`,
		req.Email,
	).Scan(
		&merchant.ID, &merchant.Email, &merchant.PasswordHash, &merchant.BusinessName,
		&merchant.BusinessURL, &merchant.Role, &merchant.IsActive, &merchant.CreatedAt, &merchant.UpdatedAt,
	)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(merchant.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := s.generateJWT(merchant.ID, merchant.Email)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{Token: token, Merchant: merchant}, nil
}

// ── API Key Generation ───────────────────────────────────────────
// Generates pk_<env>_<random> + sk_<env>_<random> key pairs.

func (s *AuthService) GenerateAPIKeys(ctx context.Context, merchantID uuid.UUID, env string) (*models.APIKeyPair, error) {
	publicRaw, err := generateRandomKey(32)
	if err != nil {
		return nil, err
	}
	secretRaw, err := generateRandomKey(32)
	if err != nil {
		return nil, err
	}

	publicKey := fmt.Sprintf("pk_%s_%s", env, publicRaw)
	secretKey := fmt.Sprintf("sk_%s_%s", env, secretRaw)

	// Hash for storage
	pkHash, _ := bcrypt.GenerateFromPassword([]byte(publicKey), bcrypt.DefaultCost)
	skHash, _ := bcrypt.GenerateFromPassword([]byte(secretKey), bcrypt.DefaultCost)

	// Store public key
	_, err = s.db.Exec(ctx,
		`INSERT INTO api_keys (merchant_id, prefix, key_hash, last_four, environment, is_secret)
		 VALUES ($1, $2, $3, $4, $5, false)`,
		merchantID, fmt.Sprintf("pk_%s", env), string(pkHash), publicKey[len(publicKey)-4:], env,
	)
	if err != nil {
		return nil, fmt.Errorf("store public key: %w", err)
	}

	// Store secret key
	_, err = s.db.Exec(ctx,
		`INSERT INTO api_keys (merchant_id, prefix, key_hash, last_four, environment, is_secret)
		 VALUES ($1, $2, $3, $4, $5, true)`,
		merchantID, fmt.Sprintf("sk_%s", env), string(skHash), secretKey[len(secretKey)-4:], env,
	)
	if err != nil {
		return nil, fmt.Errorf("store secret key: %w", err)
	}

	return &models.APIKeyPair{PublicKey: publicKey, SecretKey: secretKey}, nil
}

// ValidateAPIKey checks a raw API key against stored hashes.
// Returns the merchant ID and environment if valid.
func (s *AuthService) ValidateAPIKey(ctx context.Context, rawKey string) (uuid.UUID, string, bool, error) {
	// Extract prefix to narrow search (e.g., "sk_live" from "sk_live_abc123")
	prefix := extractPrefix(rawKey)
	if prefix == "" {
		return uuid.Nil, "", false, ErrInvalidAPIKey
	}

	rows, err := s.db.Query(ctx,
		`SELECT id, merchant_id, key_hash, environment, is_secret
		 FROM api_keys WHERE prefix = $1 AND is_active = true`, prefix)
	if err != nil {
		return uuid.Nil, "", false, fmt.Errorf("query api keys: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var keyID, merchantID uuid.UUID
		var keyHash, env string
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

	return uuid.Nil, "", false, ErrInvalidAPIKey
}

// ── Provider Credentials ─────────────────────────────────────────

func (s *AuthService) StoreProviderCredentials(ctx context.Context, merchantID uuid.UUID, req models.ProviderCredentialsRequest) error {
	encSecret, err := Encrypt(req.SecretKey, s.cfg.EncryptionKey)
	if err != nil {
		return fmt.Errorf("encrypt secret key: %w", err)
	}

	var encWebhookSecret *string
	if req.WebhookSecret != "" {
		enc, err := Encrypt(req.WebhookSecret, s.cfg.EncryptionKey)
		if err != nil {
			return fmt.Errorf("encrypt webhook secret: %w", err)
		}
		encWebhookSecret = &enc
	}

	_, err = s.db.Exec(ctx,
		`INSERT INTO merchant_providers (merchant_id, provider, environment, secret_key_enc, public_key, webhook_secret_enc)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (merchant_id, provider, environment)
		 DO UPDATE SET secret_key_enc = $4, public_key = $5, webhook_secret_enc = $6, updated_at = NOW()`,
		merchantID, req.Provider, req.Environment, encSecret, nilIfEmpty(req.PublicKey), encWebhookSecret,
	)
	if err != nil {
		return fmt.Errorf("store provider credentials: %w", err)
	}

	return nil
}

// GetProviderSecret retrieves and decrypts a merchant's provider secret key.
func (s *AuthService) GetProviderSecret(ctx context.Context, merchantID uuid.UUID, provider, env string) (string, error) {
	var encSecret string
	err := s.db.QueryRow(ctx,
		`SELECT secret_key_enc FROM merchant_providers
		 WHERE merchant_id = $1 AND provider = $2 AND environment = $3 AND is_active = true`,
		merchantID, provider, env,
	).Scan(&encSecret)
	if err != nil {
		return "", fmt.Errorf("provider credentials not found: %w", err)
	}

	return Decrypt(encSecret, s.cfg.EncryptionKey)
}

// ── Helpers ──────────────────────────────────────────────────────

func (s *AuthService) generateJWT(merchantID uuid.UUID, email string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   merchantID.String(),
		"email": email,
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func generateRandomKey(bytes int) (string, error) {
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

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
