package config

import "os"

type Config struct {
	// Server
	Port        string
	Environment string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// Auth
	JWTSecret              string
	EncryptionKey          string
	GithubClientID         string
	GithubClientSecret     string
	FrontendURL            string

	// Rate Limiting
	RateLimitRPS   int
	RateLimitBurst int

	// Webhook Relay
	WebhookMaxRetries int
	WebhookTimeoutSec int

	// Payment Links
	CheckoutBaseURL string // e.g., "https://pay.payvault.co" or "http://localhost:8080/api/v1/checkout"
}

func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "8080"),
		Environment: getEnv("ENVIRONMENT", "development"),

		DatabaseURL: getEnv("DATABASE_URL", "postgres://payvault:payvault@localhost:5432/payvault?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379/0"),

		JWTSecret:          getEnv("JWT_SECRET", "change-me-in-production"),
		EncryptionKey:      getEnv("ENCRYPTION_KEY", "0000000000000000000000000000000000000000000000000000000000000000"),
		GithubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GithubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:3000"),

		RateLimitRPS:   getEnvInt("RATE_LIMIT_RPS", 100),
		RateLimitBurst: getEnvInt("RATE_LIMIT_BURST", 200),

		WebhookMaxRetries: getEnvInt("WEBHOOK_MAX_RETRIES", 5),
		WebhookTimeoutSec: getEnvInt("WEBHOOK_TIMEOUT_SEC", 30),

		CheckoutBaseURL: getEnv("CHECKOUT_BASE_URL", "http://localhost:8080/api/v1/checkout"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	var result int
	for _, c := range val {
		if c < '0' || c > '9' {
			return fallback
		}
		result = result*10 + int(c-'0')
	}
	return result
}
