# PayVault

**One API. Every African payment provider.**

PayVault is a unified payment platform for African markets — a single API that works with Paystack, Flutterwave, and any provider you add.

## Repository Structure

```
payvault/
├── packages/
│   └── sdk/          # TypeScript SDK — npm package `payvault-sdk`
├── apps/
│   ├── api/          # Go backend API (chi, PostgreSQL, Redis)
│   └── dashboard/    # React merchant dashboard (Vite, Tailwind)
├── docker-compose.yml
└── README.md
```

## Quick Start

### Prerequisites

- **Go 1.22+** (for the API)
- **Node.js 18+** (for the SDK and dashboard)
- **Docker & Docker Compose** (for PostgreSQL and Redis)

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Run the API

```bash
cd apps/api
cp env.example .env   # Edit with your credentials
go run ./cmd/api
```

The API starts on `http://localhost:8080`.

### 3. Run the Dashboard

```bash
cd apps/dashboard
npm install
npm run dev
```

The dashboard starts on `http://localhost:3000` and proxies API requests to `:8080`.

### 4. Use the SDK

```bash
cd packages/sdk
npm install
npm run build
```

See [packages/sdk/README.md](packages/sdk/README.md) for full SDK documentation.

## Component Details

| Component | Tech Stack | Location |
|-----------|-----------|----------|
| **SDK** | TypeScript, tsup | `packages/sdk/` |
| **API** | Go, chi, pgx, Redis | `apps/api/` |
| **Dashboard** | React 19, Vite, Tailwind 4, Radix UI | `apps/dashboard/` |

## License

MIT — see [LICENSE](LICENSE) for details.
