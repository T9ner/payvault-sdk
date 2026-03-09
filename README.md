# PayVault API

A unified payment processing API for African merchants. Integrate Paystack, Flutterwave, and more through a single API.

## Features

- **Multi-provider support** — Paystack and Flutterwave out of the box, extensible provider interface
- **Unified API** — One integration for your app, regardless of payment provider
- **Merchant dashboard** — JWT-authenticated endpoints for managing API keys, credentials, and transactions
- **SDK-ready** — API key authenticated endpoints for client/server integrations
- **Webhook handling** — Automatic signature verification for Paystack (HMAC-SHA512) and Flutterwave (verif-hash)
- **Security** — AES-256-GCM encryption for stored provider credentials, bcrypt password hashing, Redis rate limiting
- **Audit logging** — Every state change is recorded
- **Background workers** — Redis-backed queue for webhook delivery and async processing

## Tech Stack

- **Go** with Chi router
- **PostgreSQL** (pgx driver)
- **Redis** (queues, rate limiting, caching)
- **Docker Compose** for local development

## Project Structure

```
cmd/api/              → Entry point
internal/
  api/                → HTTP handlers and router
  config/             → Environment configuration
  database/           → PostgreSQL connection and migrations
  middleware/         → JWT auth, API key auth, rate limiting
  models/             → Data models
  queue/              → Redis job queue with worker pool
  services/           → Business logic (auth, transactions, providers, crypto)
migrations/           → SQL migration files
```

## Quick Start

```bash
# Clone and configure
cp env.example .env
# Edit .env with your database, Redis, and JWT settings

# Start infrastructure
docker-compose up -d

# Run the API
go run cmd/api/main.go
```

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Merchant registration |
| POST | `/api/v1/auth/login` | Merchant login |

### Dashboard (JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/dashboard/api-keys` | Generate API keys |
| POST | `/api/v1/dashboard/providers` | Store provider credentials |
| GET | `/api/v1/dashboard/transactions` | Transaction history (paginated) |

### Payments (API Key)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/payments/charge` | Initiate a charge |
| GET | `/api/v1/payments/verify/{reference}` | Verify a transaction |
| POST | `/api/v1/payments/refund` | Process a refund |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/webhooks/paystack` | Paystack callback receiver |
| POST | `/api/v1/webhooks/flutterwave` | Flutterwave callback receiver |

## License

MIT
