# PayVault API

A modern, production-ready payment gateway abstraction layer built in Go. PayVault provides a unified API for integrating multiple African payment providers (Paystack, Flutterwave) with built-in fraud detection, subscription management, webhook delivery, and comprehensive transaction handling.

## Features

- **Multi-Provider Support** - Unified interface for Paystack and Flutterwave
- **Fraud Detection** - Rule-based and ML-ready fraud scoring engine
- **Subscription Management** - Full lifecycle subscription handling with plan management
- **Payment Links** - Shareable, trackable payment link generation
- **Webhook Delivery** - Reliable webhook dispatch with retry logic and delivery tracking
- **Transaction Processing** - Complete payment lifecycle with status tracking
- **Rate Limiting** - Token bucket rate limiter middleware
- **JWT Authentication** - Secure API key and JWT-based auth
- **Database Migrations** - Versioned PostgreSQL schema migrations
- **Redis Queue** - Background job processing for async operations
- **Docker Ready** - Full Docker and docker-compose setup

## Tech Stack

- **Language:** Go 1.21+
- **Database:** PostgreSQL 15+
- **Cache/Queue:** Redis 7+
- **Auth:** JWT (RS256)
- **Containerization:** Docker + docker-compose

## Project Structure

```
payvault-api/
├── cmd/api/main.go              # Application entry point
├── internal/
│   ├── api/
│   │   ├── handlers.go          # HTTP request handlers
│   │   └── router.go            # Route definitions
│   ├── config/config.go         # Configuration management
│   ├── database/
│   │   ├── database.go          # Database connection
│   │   └── migrate.go           # Migration runner
│   ├── middleware/
│   │   ├── auth.go              # Authentication middleware
│   │   ├── helpers.go           # Middleware utilities
│   │   └── ratelimit.go         # Rate limiting
│   ├── models/models.go         # Data models and types
│   ├── queue/redis.go           # Redis queue client
│   └── services/
│       ├── auth.go              # Auth service
│       ├── crypto.go            # Cryptographic utilities
│       ├── flutterwave.go       # Flutterwave provider
│       ├── fraud.go             # Fraud detection engine
│       ├── helpers.go           # Service utilities
│       ├── payment_link.go      # Payment link service
│       ├── paystack.go          # Paystack provider
│       ├── provider.go          # Provider interface
│       ├── status.go            # Health/status service
│       ├── subscription.go      # Subscription service
│       ├── transaction.go       # Transaction service
│       └── webhook_delivery.go  # Webhook delivery service
├── migrations/
│   ├── 000001_init_schema.up.sql
│   └── 000001_init_schema.down.sql
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── env.example
```

## Getting Started

1. Clone the repository
2. Copy `env.example` to `.env` and fill in your configuration
3. Run `docker-compose up` to start all services
4. The API will be available at `http://localhost:8080`

## License

MIT

---
_Last synced from workspace: 2026-03-09_
