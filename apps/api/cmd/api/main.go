package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"payvault-api/internal/api"
	"payvault-api/internal/config"
	"payvault-api/internal/database"
	"payvault-api/internal/middleware"
	"payvault-api/internal/queue"
	"payvault-api/internal/services"

	"github.com/joho/godotenv"
)

func main() {
	// Load .env file (ignore error -- env vars may be set directly)
	_ = godotenv.Load()

	cfg := config.Load()

	// ── Database ────────────────────────────────────────────────
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("database connected")

	// Run migrations
	if err := database.Migrate(cfg.DatabaseURL); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	log.Println("migrations applied")

	// ── Redis ────────────────────────────────────────────────────
	redisClient := queue.NewRedisClient(cfg.RedisURL)
	defer redisClient.Close()

	log.Println("redis connected")

	// ── Queue Adapter ────────────────────────────────────────────
	queueAdapter := queue.NewQueueAdapter(redisClient)

	// ── Core Services ────────────────────────────────────────────

	// Crypto service for encrypting/decrypting provider keys
	cryptoSvc := services.NewCryptoService(cfg.EncryptionKey)

	// Auth service for merchant registration, login, JWT, API keys
	authSvc := services.NewAuthService(db, cfg.JWTSecret, cryptoSvc)

	// Payment provider registry
	providers := services.NewProviderRegistry()
	providers.Register(services.NewPaystackProvider())
	providers.Register(services.NewFlutterwaveProvider())
	providers.Register(services.NewMonnifyProvider())
	providers.Register(services.NewSquadProvider())

	// Transaction service (core payment lifecycle)
	txnSvc := services.NewTransactionService(db, providers, cryptoSvc, queueAdapter)

	// ── Phase 4-7 Services ───────────────────────────────────────

	// Payment links (shareable checkout URLs)
	linksSvc := services.NewPaymentLinkService(db, txnSvc, cfg.CheckoutBaseURL)

	// Subscriptions (recurring billing via provider plans)
	subsSvc := services.NewSubscriptionService(db, providers, cryptoSvc)

	// Fraud detection (heuristic rules + Redis velocity counters)
	fraudSvc := services.NewFraudService(db, redisClient)

	// Webhook delivery (forward events to merchant URLs synchronously)
	webhookDlvSvc := services.NewWebhookDeliveryService(db, cryptoSvc, cfg.WebhookMaxRetries)

	// Status service (webhook-free DX -- polling and long-poll)
	statusSvc := services.NewStatusService(db, redisClient)

	// Settings (API keys and provider creds)
	settingsSvc := services.NewSettingsService(db, cryptoSvc)

	log.Println("services initialized")

	// Removed Webhook deliverer from worker pool as it is now synchronous dispatch

	// ── Middleware ────────────────────────────────────────────────

	// Auth middleware (JWT + API key authentication)
	authMW := middleware.NewAuthMiddleware(db, cfg.JWTSecret, authSvc)

	// Rate limiter (Redis sliding window, per-merchant)
	rateLimiter := middleware.NewRateLimiter(redisClient, cfg.RateLimitRPS, cfg.RateLimitBurst)

	log.Println("middleware initialized")

	// ── HTTP Handlers & Router ───────────────────────────────────

	handlers := api.NewHandlers(
		authSvc,
		txnSvc,
		providers,
		cryptoSvc,
		linksSvc,
		subsSvc,
		fraudSvc,
		webhookDlvSvc,
		statusSvc,
		cfg,
		settingsSvc,
	)

	router := api.NewRouter(handlers, authMW, rateLimiter)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// ── Graceful Shutdown ────────────────────────────────────────
	go func() {
		log.Printf("PayVault API v0.1.0 starting on port %s", cfg.Port)
		log.Printf("Providers: %v", providers.List())
		log.Printf("Checkout base URL: %s", cfg.CheckoutBaseURL)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}

	log.Println("server stopped")
}
