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

	// ── Database ────────────────────────────────────────────────────────
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

	// ── Redis / Queue ───────────────────────────────────────────────────
	redisClient := queue.NewRedisClient(cfg.RedisURL)
	defer redisClient.Close()

	log.Println("redis connected")

	// ── Worker Pool ─────────────────────────────────────────────────────
	workerPool := queue.NewWorkerPool(redisClient, db, cfg)
	go workerPool.Start(context.Background())
	defer workerPool.Stop()

	log.Println("worker pool started")

	// ── Services ────────────────────────────────────────────────────────

	// Crypto service for encrypting/decrypting provider keys
	cryptoSvc := services.NewCryptoService(cfg.EncryptionKey)

	// Auth service for merchant registration, login, JWT, API keys
	authSvc := services.NewAuthService(db, cfg.JWTSecret, cryptoSvc)

	// Payment provider registry
	providers := services.NewProviderRegistry()
	providers.Register(services.NewPaystackProvider())
	providers.Register(services.NewFlutterwaveProvider())

	// Transaction service (core payment lifecycle)
	txnSvc := services.NewTransactionService(db, providers, cryptoSvc, redisClient)

	// Rate limiter
	var rateLimiter *middleware.RateLimiter
	if redisClient != nil {
		rateLimiter = middleware.NewRateLimiter(redisClient.Client(), 100, time.Minute) // 100 req/min per merchant
	}

	log.Println("services initialized")

	// ── HTTP Server ─────────────────────────────────────────────────────
	router := api.NewRouter(authSvc, txnSvc, providers, cryptoSvc, rateLimiter)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// ── Graceful Shutdown ───────────────────────────────────────────────
	go func() {
		log.Printf("PayVault API v0.1.0 starting on port %s", cfg.Port)
		log.Printf("Providers: %v", providers.List())
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
