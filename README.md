<div align="center">

# PayVault

### One API. Every African payment provider.

[![npm version](https://img.shields.io/npm/v/payvault-sdk.svg?style=flat-square)](https://www.npmjs.com/package/payvault-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

**Stop rewriting payment code when you switch providers.**
PayVault gives you a single, type-safe API that works with Paystack, Flutterwave, and any provider you add.

[Quick Start](#quick-start) &bull; [Architecture](#architecture) &bull; [SDK Usage](#sdk-usage) &bull; [API](#api) &bull; [Dashboard](#dashboard) &bull; [Contributing](#contributing)

</div>

---

## Why PayVault?

| Problem | PayVault Solution |
|---|---|
| Every provider has a different API shape | One unified interface for all providers |
| Switching providers means rewriting code | Change one line to switch providers |
| 15+ transaction statuses across providers | 4 unified statuses: `success`, `failed`, `pending`, `abandoned` |
| Different amount formats (kobo vs naira) | Always use major currency units (5000 = N5,000) |
| No retry logic out of the box | Smart retry with exponential backoff + jitter |
| Webhook formats differ per provider | Unified webhook events with signature verification |

---

## Quick Start

### Prerequisites

- **Node.js 18+** (for SDK and Dashboard)
- **Go 1.22+** (for API)
- **Docker & Docker Compose** (for PostgreSQL and Redis)

### 1. Install the SDK

```bash
npm install payvault-sdk
```

### 2. Use PayVault in Your App

```typescript
import { PayVault } from 'payvault-sdk';

// Create a PayVault instance for Paystack
const vault = PayVault.paystack('sk_test_xxxxx');

// Initialize a transaction — returns a checkout URL
const tx = await vault.initializeTransaction({
  amount: 5000,          // N5,000 (always in major units)
  email: 'customer@example.com',
  currency: 'NGN',
  metadata: { orderId: 'order_123' },
});

console.log(tx.authorizationUrl);
// => "https://checkout.paystack.com/abc123"
```

### 3. Start the API (Optional)

If you want to run the hosted backend:

```bash
# Start infrastructure
docker compose up -d postgres redis

# Run the API
cd apps/api
cp env.example .env   # Edit with your credentials
go run ./cmd/api
```

The API starts on `http://localhost:8080`.

### 4. Run the Dashboard (Optional)

If you want the merchant dashboard UI:

```bash
cd apps/dashboard
npm install
npm run dev
```

The dashboard starts on `http://localhost:3000` and proxies API requests to `:8080`.

---

## Architecture

PayVault is a complete payment platform with three components:

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                        │
│                                                             │
│  import { PayVault } from 'payvault-sdk'                    │
│  const vault = PayVault.paystack('sk_test_xxxxx')          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ TypeScript SDK
                  │ (npm package)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     Payment Providers                       │
│                                                             │
│    Paystack  │  Flutterwave  │  Your Custom Provider       │
└─────────────────────────────────────────────────────────────┘

            Optional Backend Components:

┌──────────────────────┐          ┌──────────────────────┐
│   API (Go/chi)       │          │  Dashboard (React)   │
│                      │          │                      │
│  - Unified REST API  │◄────────►│  - Merchant UI       │
│  - Multi-provider    │          │  - Analytics         │
│  - PostgreSQL        │          │  - Settings          │
│  - Redis queue       │          │  - Vite + Tailwind   │
└──────────────────────┘          └──────────────────────┘
```

### Component Roles

| Component | Purpose | Used By |
|-----------|---------|---------|
| **SDK** (`packages/sdk/`) | TypeScript client for payment providers — install via npm | Developers integrating payments |
| **API** (`apps/api/`) | Optional Go backend for hosted multi-tenant payment gateway | Companies running their own payment infrastructure |
| **Dashboard** (`apps/dashboard/`) | Optional merchant UI for managing transactions, viewing analytics | Merchants using the hosted API |

**Most developers only need the SDK.** The API and Dashboard are for companies building a hosted payment gateway service.

---

## Repository Structure

```
payvault/
├── packages/
│   └── sdk/                # TypeScript SDK — npm package `payvault-sdk`
│       ├── src/
│       │   ├── client.ts           # PayVault main client class
│       │   ├── types.ts            # All TypeScript interfaces
│       │   ├── errors.ts           # Structured error classes
│       │   ├── http.ts             # HTTP client with retry logic
│       │   ├── utils.ts            # Shared utilities
│       │   └── providers/
│       │       ├── paystack.ts     # Paystack implementation
│       │       └── flutterwave.ts  # Flutterwave implementation
│       ├── checkout/               # Embeddable checkout widget
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── api/                # Go backend API
│   │   ├── cmd/api/                # Main entry point
│   │   ├── internal/
│   │   │   ├── handlers/           # HTTP request handlers
│   │   │   ├── services/           # Business logic (Paystack, Flutterwave)
│   │   │   ├── models/             # Database models
│   │   │   ├── middleware/         # Auth, logging, CORS
│   │   │   └── queue/              # Redis job queue
│   │   ├── migrations/             # SQL schema migrations
│   │   ├── go.mod
│   │   ├── Dockerfile
│   │   └── env.example
│   │
│   └── dashboard/          # React merchant dashboard
│       ├── src/
│       │   ├── pages/              # Page components
│       │   ├── components/         # Reusable UI components
│       │   ├── services/           # API client
│       │   └── store/              # State management
│       ├── public/
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
│
├── docker-compose.yml      # PostgreSQL + Redis
├── LICENSE
└── README.md
```

---

## SDK Usage

The SDK is the core of PayVault — a TypeScript client that abstracts payment provider differences.

### Initialize a Transaction

```typescript
import { PayVault } from 'payvault-sdk';

const vault = PayVault.paystack('sk_test_xxxxx');

const tx = await vault.initializeTransaction({
  amount: 5000,
  email: 'customer@example.com',
  currency: 'NGN',
  metadata: { orderId: 'order_123' },
});

// Redirect customer to tx.authorizationUrl
```

### Verify a Transaction

```typescript
const result = await vault.verifyTransaction('pvt_ps_abc123');

if (result.success) {
  console.log(`Paid ${result.amount} ${result.currency}`);
  console.log(`Channel: ${result.channel}`);        // 'card', 'bank_transfer', etc.
  console.log(`Customer: ${result.customer.email}`);

  // Save authorization code for recurring charges
  if (result.authorization?.reusable) {
    await saveAuthCode(result.customer.email, result.authorization.code);
  }
}
```

### Switch to Flutterwave

The killer feature — change **one line** to switch providers:

```diff
- const vault = PayVault.paystack('sk_test_xxxxx');
+ const vault = PayVault.flutterwave('FLWSECK_TEST-xxxxx');
```

Everything else stays the same. Same method names, same response shapes, same types.

### Handle Webhooks

```typescript
import express from 'express';
import { PayVault } from 'payvault-sdk';

const app = express();
const vault = PayVault.paystack('sk_live_xxxxx', {
  webhookSecret: 'whsec_xxxxx',
});

// Register handlers
vault.on('charge.success', async (event) => {
  console.log(`Payment received: ${event.amount} ${event.currency}`);
  await fulfillOrder(event.reference);
});

vault.on('charge.failed', async (event) => {
  await notifyCustomer(event.customer.email);
});

// Webhook endpoint
app.post('/webhooks/payments', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature =
      (req.headers['x-paystack-signature'] as string) ||
      (req.headers['verif-hash'] as string);

    const event = await vault.handleWebhook(req.body, signature);
    res.status(200).json({ received: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid signature' });
  }
});
```

### Recurring Charges

```typescript
// Step 1: Save authorization code after first payment
const verification = await vault.verifyTransaction('pvt_first_payment');

if (verification.authorization?.reusable) {
  const authCode = verification.authorization.code;
  // Save authCode to database
}

// Step 2: Charge the saved card later
const charge = await vault.charge({
  amount: 5000,
  email: 'customer@example.com',
  channel: 'card',
  authorizationCode: authCode,
});
```

### Error Handling

```typescript
import {
  PayVaultError,
  AuthenticationError,
  ValidationError,
  ProviderError,
} from 'payvault-sdk';

try {
  await vault.initializeTransaction({ amount: 5000, email: '' });
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.field);       // 'email'
    console.log(err.message);     // 'Email is required'
  }

  if (err instanceof AuthenticationError) {
    console.log(err.provider);    // 'paystack'
  }

  if (err instanceof ProviderError) {
    console.log(err.statusCode);  // 422, 500, etc.
    console.log(err.raw);         // raw provider error
  }
}
```

**For complete SDK documentation, see [packages/sdk/README.md](packages/sdk/README.md).**

---

## API

The API is a Go backend that provides a hosted, multi-tenant payment gateway. It wraps the SDK's functionality behind a REST API with authentication, rate limiting, and async job processing.

### Tech Stack

- **Framework:** [chi](https://github.com/go-chi/chi) (lightweight, composable HTTP router)
- **Database:** PostgreSQL 16 with [pgx](https://github.com/jackc/pgx) driver
- **Cache/Queue:** Redis 7 for async webhook delivery
- **Auth:** JWT-based merchant authentication
- **Observability:** Structured logging with transaction tracing

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Create merchant account |
| `/auth/login` | POST | Authenticate and get JWT |
| `/transactions/initialize` | POST | Start a payment transaction |
| `/transactions/:ref/verify` | GET | Verify transaction status |
| `/transactions` | GET | List all transactions (paginated) |
| `/webhooks/:provider` | POST | Receive provider webhooks |
| `/settings` | GET/PUT | Merchant settings and API keys |

### Running the API

```bash
# Start dependencies
docker compose up -d postgres redis

# Copy and edit environment file
cd apps/api
cp env.example .env

# Required env vars:
# - DATABASE_URL=postgres://payvault:payvault@localhost:5432/payvault
# - REDIS_URL=redis://localhost:6379
# - JWT_SECRET=your-secret-key
# - PAYSTACK_SECRET_KEY=sk_test_xxxxx
# - FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxxxx

# Run migrations
go run ./cmd/api migrate

# Start the server
go run ./cmd/api
```

The API will start on `:8080`.

### Docker Deployment

```bash
# Build and run all services
docker compose up -d

# API will be available at localhost:8080
```

**For API documentation and development guide, see [apps/api/README.md](apps/api/README.md).**

---

## Dashboard

The Dashboard is a React SPA for merchants to manage transactions, view analytics, and configure payment settings.

### Tech Stack

- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS 4 (v4 alpha with CSS-first config)
- **UI Components:** Radix UI primitives
- **State:** React Query for server state, Context API for local state
- **Routing:** React Router v7

### Features

- 📊 **Transaction Analytics** — Real-time charts and revenue tracking
- 💳 **Transaction List** — Searchable, filterable table with pagination
- 🔔 **Webhook Logs** — Debug webhook delivery and retries
- ⚙️ **Settings** — Configure API keys, webhook URLs, and provider preferences
- 🔐 **Authentication** — JWT-based login with protected routes
- 🌓 **Dark Mode** — Full dark mode support

### Running the Dashboard

```bash
cd apps/dashboard
npm install
npm run dev
```

The dashboard starts on `http://localhost:3000`. It proxies API requests to `http://localhost:8080` (configure in `vite.config.ts`).

### Production Build

```bash
npm run build
# Output: dist/ folder ready to deploy to Vercel, Netlify, or CDN
```

**For component documentation and development guide, see [apps/dashboard/README.md](apps/dashboard/README.md).**

---

## Configuration

### SDK Configuration

```typescript
const vault = new PayVault({
  provider: 'paystack',            // or 'flutterwave'
  secretKey: 'sk_test_xxxxx',
  publicKey: 'pk_test_xxxxx',      // optional
  currency: 'NGN',                 // default currency
  webhookSecret: 'whsec_xxxxx',    // for webhook verification

  // Smart retry (enabled by default)
  retry: {
    enabled: true,
    maxAttempts: 3,
    backoffMs: 1000,               // doubles each attempt + jitter
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  },

  timeout: 30000,                  // request timeout in ms

  // Metadata attached to every transaction
  metadata: {
    source: 'web',
    version: '2.0',
  },
});
```

### API Configuration

Environment variables in `apps/api/.env`:

```bash
# Database
DATABASE_URL=postgres://payvault:payvault@localhost:5432/payvault

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-secret-key-min-32-chars

# Payment Providers
PAYSTACK_SECRET_KEY=sk_live_xxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxx
FLUTTERWAVE_SECRET_KEY=FLWSECK-xxxxx
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-xxxxx

# Server
PORT=8080
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
```

### Dashboard Configuration

Environment variables in `apps/dashboard/.env`:

```bash
VITE_API_URL=http://localhost:8080
```

---

## Provider Switching

PayVault's architecture makes provider migration painless. Your business logic never changes.

### Environment-Based Switching

```typescript
const vault = new PayVault({
  provider: process.env.PAYMENT_PROVIDER!,     // 'paystack' or 'flutterwave'
  secretKey: process.env.PAYMENT_SECRET_KEY!,
  currency: 'NGN',
});

// This code works identically with either provider
const tx = await vault.initializeTransaction({
  amount: 5000,
  email: 'customer@example.com',
});
```

### A/B Testing Providers

```typescript
function getPaymentVault(userId: string): PayVault {
  // Route 20% of users to Flutterwave
  const useFlutterwave = hashUserId(userId) % 5 === 0;

  return useFlutterwave
    ? PayVault.flutterwave(process.env.FLW_SECRET!)
    : PayVault.paystack(process.env.PS_SECRET!);
}
```

### Failover

```typescript
async function processPayment(config: TransactionConfig) {
  try {
    const primary = PayVault.paystack(process.env.PS_SECRET!);
    return await primary.initializeTransaction(config);
  } catch (err) {
    console.warn('Paystack failed, falling back to Flutterwave');
    const fallback = PayVault.flutterwave(process.env.FLW_SECRET!);
    return await fallback.initializeTransaction(config);
  }
}
```

---

## Unified Status Mapping

PayVault normalizes provider-specific statuses into 4 universal states:

| Unified Status | Paystack | Flutterwave |
|---|---|---|
| `success` | `success` | `successful`, `completed` |
| `failed` | `failed`, `reversed` | `failed`, `error` |
| `pending` | `pending`, `processing`, `ongoing`, `queued` | `pending`, `processing` |
| `abandoned` | `abandoned` | `cancelled` |

---

## Amount Handling

PayVault always works in **major currency units** (the number your customer sees).

```typescript
// You write this:
await vault.initializeTransaction({ amount: 5000, email: '...' });
// PayVault sends 500000 (kobo) to Paystack
// PayVault sends 5000 (naira) to Flutterwave
// You never think about conversion
```

Zero-decimal currencies (JPY, KRW, VND) are handled automatically.

---

## Contributing

We welcome contributions! Here's how to work on each component:

### Adding a New Provider to the SDK

1. Create `packages/sdk/src/providers/yourprovider.ts`
2. Implement the `Provider` interface
3. Add it to the `BUILTIN_PROVIDERS` registry in `src/client.ts`
4. Export it from `src/index.ts`
5. Add status mappings to `src/utils.ts`
6. Write tests and submit a PR

### Working on the API

```bash
cd apps/api

# Install dependencies
go mod download

# Run tests
go test ./...

# Run with hot reload (install air first: go install github.com/cosmtrek/air@latest)
air

# Create a new migration
# (install migrate: brew install golang-migrate)
migrate create -ext sql -dir migrations -seq add_your_feature
```

### Working on the Dashboard

```bash
cd apps/dashboard

# Install dependencies
npm install

# Run dev server
npm run dev

# Run type checking
npm run type-check

# Build for production
npm run build
```

### Monorepo Workflow

1. **Fork** the repo
2. **Create a branch** (`git checkout -b feat/my-feature`)
3. **Make your changes** in the appropriate package/app
4. **Test your changes** (SDK: `npm run build`, API: `go test ./...`, Dashboard: `npm run build`)
5. **Submit a PR** with a clear description

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Built with care for African developers, by African developers.
