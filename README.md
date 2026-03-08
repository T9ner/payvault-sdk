<div align="center">

# PayVault

### One API. Every African payment provider.

[![npm version](https://img.shields.io/npm/v/payvault.svg?style=flat-square)](https://www.npmjs.com/package/payvault)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

**Stop rewriting payment code when you switch providers.**
PayVault gives you a single, type-safe API that works with Paystack, Flutterwave, and any provider you add.

[Quick Start](#quick-start) &bull; [API Reference](#api-reference) &bull; [Webhooks](#webhooks) &bull; [Provider Switching](#provider-switching) &bull; [Custom Providers](#custom-providers)

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

## Quick Start

### Installation

```bash
npm install payvault
```

### Initialize a Payment (Paystack)

```typescript
import { PayVault } from 'payvault';

// Create a PayVault instance for Paystack
const vault = PayVault.paystack('sk_test_xxxxx');

// Initialize a transaction -- returns a checkout URL
const tx = await vault.initializeTransaction({
  amount: 5000,          // N5,000 (always in major units)
  email: 'customer@example.com',
  currency: 'NGN',
  metadata: { orderId: 'order_123' },
});

console.log(tx.authorizationUrl);
// => "https://checkout.paystack.com/abc123"
// Redirect your customer to this URL
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

The killer feature -- change **one line** to switch providers:

```diff
- const vault = PayVault.paystack('sk_test_xxxxx');
+ const vault = PayVault.flutterwave('FLWSECK_TEST-xxxxx');
```

Everything else stays the same. Same method names, same response shapes, same types.

---

## Configuration

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

// Or use the convenience factory methods:
const paystackVault = PayVault.paystack('sk_test_xxxxx', {
  currency: 'NGN',
  webhookSecret: 'whsec_xxxxx',
});
```

---

## API Reference

### Transactions

| Method | Description |
|---|---|
| `initializeTransaction(config)` | Create a payment and get a checkout URL |
| `verifyTransaction(reference)` | Verify a transaction status server-side |

### Charges

| Method | Description |
|---|---|
| `charge(config)` | Direct charge (card, bank, recurring via auth code) |
| `submitAuthorization(ref, auth)` | Submit OTP, PIN, or other auth response |

### Refunds

| Method | Description |
|---|---|
| `refund(config)` | Full or partial refund by transaction reference |

### Subscriptions

| Method | Description |
|---|---|
| `createSubscription(config)` | Subscribe a customer to a plan |
| `cancelSubscription(code)` | Cancel an active subscription |

### Webhooks

| Method | Description |
|---|---|
| `verifyWebhook(payload, signature)` | Verify webhook signature (returns boolean) |
| `parseWebhook(payload)` | Parse raw webhook into unified event |
| `handleWebhook(payload, signature)` | Verify + parse + dispatch to handlers |
| `on(eventType, handler)` | Register a webhook event handler |

### Utilities

| Method | Description |
|---|---|
| `PayVault.paystack(secretKey, opts?)` | Factory for Paystack |
| `PayVault.flutterwave(secretKey, opts?)` | Factory for Flutterwave |
| `PayVault.registerProvider(name, class)` | Register a custom provider |
| `vault.providerName` | Get current provider name |

---

## Webhooks

PayVault normalizes webhook payloads across providers into a single `WebhookEvent` shape.

### Express Example

```typescript
import express from 'express';
import { PayVault } from 'payvault';

const app = express();
const vault = PayVault.paystack('sk_live_xxxxx', {
  webhookSecret: 'whsec_xxxxx',
});

// Register handlers
vault.on('charge.success', async (event) => {
  console.log(`Payment received: ${event.amount} ${event.currency}`);
  console.log(`Reference: ${event.reference}`);
  console.log(`Customer: ${event.customer.email}`);
  await fulfillOrder(event.reference);
});

vault.on('charge.failed', async (event) => {
  console.log(`Payment failed: ${event.reference}`);
  await notifyCustomer(event.customer.email);
});

// Catch-all handler for logging
vault.on('*', async (event) => {
  await logWebhookEvent(event);
});

// Webhook endpoint
app.post('/webhooks/payments', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature =
      (req.headers['x-paystack-signature'] as string) ||
      (req.headers['verif-hash'] as string);

    const event = await vault.handleWebhook(req.body, signature);
    res.status(200).json({ received: true, type: event.type });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(401).json({ error: 'Invalid webhook signature' });
  }
});
```

### Webhook Event Shape

```typescript
interface WebhookEvent {
  id: string;              // Event ID
  provider: string;        // 'paystack' | 'flutterwave'
  type: string;            // 'charge.success', 'transfer.failed', etc.
  reference: string;       // Transaction reference
  status: string;          // 'success' | 'failed' | 'pending' | 'abandoned'
  amount: number;          // In major currency units
  currency: string;        // 'NGN', 'GHS', 'KES', etc.
  customer: Customer;      // { email, firstName, lastName, phone }
  timestamp: string;       // ISO 8601
  raw: any;                // Original provider payload
}
```

---

## Recurring Charges

Charge returning customers without collecting card details again.

```typescript
// Step 1: After first successful payment, save the authorization code
const verification = await vault.verifyTransaction('pvt_first_payment');

if (verification.authorization?.reusable) {
  const authCode = verification.authorization.code;
  // Save authCode to your database, linked to the customer
}

// Step 2: Charge the saved card later
const charge = await vault.charge({
  amount: 5000,
  email: 'customer@example.com',
  channel: 'card',
  authorizationCode: authCode,   // from step 1
});

if (charge.success) {
  console.log('Recurring charge successful!');
}
```

---

## Split Payments

Route payments to subaccounts for marketplace or multi-vendor setups.

```typescript
const tx = await vault.initializeTransaction({
  amount: 10000,
  email: 'buyer@example.com',
  split: {
    subaccountCode: 'ACCT_vendor123',
    transactionCharge: 500,        // platform fee (N500)
    bearer: 'account',             // main account bears Paystack fees
  },
});
```

---

## Multi-Step Authorization

Some charges require additional authorization (OTP, PIN, 3DS redirect).

```typescript
const charge = await vault.charge({
  amount: 5000,
  email: 'customer@example.com',
  channel: 'card',
  card: {
    number: '4084084084084081',
    expMonth: '01',
    expYear: '30',
    cvv: '408',
  },
});

if (charge.requiresAuth) {
  switch (charge.authType) {
    case 'otp':
      // Show OTP input to user
      console.log(charge.authMessage);  // "Enter OTP sent to 080****1234"
      const otp = await promptUser('Enter OTP:');
      const result = await vault.submitAuthorization(charge.reference, {
        type: 'otp',
        value: otp,
      });
      break;

    case 'redirect':
      // Redirect to 3DS page
      redirectTo(charge.authUrl!);
      break;

    case 'pin':
      const pin = await promptUser('Enter card PIN:');
      await vault.submitAuthorization(charge.reference, {
        type: 'pin',
        value: pin,
      });
      break;
  }
}
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

## Smart Retry

PayVault automatically retries failed requests with exponential backoff and jitter. No configuration needed -- it works out of the box.

**What gets retried:**
- HTTP 408 (Request Timeout)
- HTTP 429 (Rate Limited)
- HTTP 500, 502, 503, 504 (Server Errors)
- Network failures and timeouts

**What never gets retried:**
- HTTP 401 (Authentication) -- throws `AuthenticationError` immediately
- HTTP 400 (Bad Request) -- your input is wrong, retrying won't help
- HTTP 404 (Not Found) -- the resource doesn't exist

**Backoff strategy:** `baseMs * 2^(attempt-1)` with +/- 25% jitter to prevent thundering herds.

```typescript
// Custom retry config
const vault = PayVault.paystack('sk_test_xxxxx', {
  retry: {
    maxAttempts: 5,             // try up to 5 times
    backoffMs: 2000,            // start at 2s, then 4s, 8s, 16s
    retryableStatuses: [429, 500, 502, 503, 504],
  },
  timeout: 15000,               // 15s per request
});

// Disable retry entirely
const noRetryVault = PayVault.paystack('sk_test_xxxxx', {
  retry: { enabled: false },
});
```

---

## Error Handling

PayVault provides structured, catchable errors with provider context.

```typescript
import {
  PayVaultError,
  AuthenticationError,
  ValidationError,
  ProviderError,
  NetworkError,
  TransactionError,
} from 'payvault';

try {
  await vault.initializeTransaction({ amount: 5000, email: '' });
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.field);       // 'email'
    console.log(err.message);     // 'Email is required'
  }

  if (err instanceof AuthenticationError) {
    // Bad API key -- check your config
    console.log(err.provider);    // 'paystack'
  }

  if (err instanceof ProviderError) {
    console.log(err.statusCode);  // 422, 500, etc.
    console.log(err.raw);         // raw provider error response
  }

  if (err instanceof NetworkError) {
    // Timeout or connection failure (after all retries exhausted)
    console.log(err.provider);
  }

  // All errors extend PayVaultError
  if (err instanceof PayVaultError) {
    console.log(err.code);        // 'VALIDATION_ERROR', 'PROVIDER_ERROR', etc.
    console.log(err.provider);    // which provider threw
  }
}
```

---

## Custom Providers

Add support for any payment provider by implementing the `Provider` interface.

```typescript
import { PayVault } from 'payvault';
import type {
  PayVaultConfig,
  Provider,
  TransactionConfig,
  TransactionResult,
  VerificationResult,
  ChargeConfig,
  ChargeResult,
  RefundConfig,
  RefundResult,
  WebhookEvent,
} from 'payvault';

class MyCustomProvider implements Provider {
  name = 'my_provider';

  constructor(private config: PayVaultConfig) {
    // Initialize your provider with config.secretKey, etc.
  }

  async initializeTransaction(config: TransactionConfig): Promise<TransactionResult> {
    // Call your provider's API
    // Return a unified TransactionResult
    return {
      success: true,
      provider: this.name,
      authorizationUrl: 'https://pay.myprovider.com/checkout/abc',
      accessCode: 'abc',
      reference: 'ref_123',
      raw: {},
    };
  }

  async verifyTransaction(reference: string): Promise<VerificationResult> {
    // Implement verification
    throw new Error('Not implemented');
  }

  async charge(config: ChargeConfig): Promise<ChargeResult> {
    // Implement direct charge
    throw new Error('Not implemented');
  }

  async submitAuthorization(
    ref: string,
    auth: { type: string; value: string }
  ): Promise<ChargeResult> {
    throw new Error('Not implemented');
  }

  async refund(config: RefundConfig): Promise<RefundResult> {
    throw new Error('Not implemented');
  }

  verifyWebhook(payload: string | Buffer, signature: string): boolean {
    // Verify webhook signature using your provider's method
    return true;
  }

  parseWebhook(payload: string | Buffer): WebhookEvent {
    // Parse into unified WebhookEvent
    throw new Error('Not implemented');
  }
}

// Register your provider
PayVault.registerProvider('my_provider', MyCustomProvider);

// Use it like any built-in provider
const vault = new PayVault({
  provider: 'my_provider',
  secretKey: 'my_secret_key',
});
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

## TypeScript Support

PayVault is written in TypeScript and exports full type definitions. Every method, config object, and response is strongly typed.

```typescript
import type {
  TransactionConfig,
  TransactionResult,
  VerificationResult,
  ChargeResult,
  WebhookEvent,
  Provider,
} from 'payvault';
```

---

## Project Structure

```
payvault/
  src/
    index.ts              # Public API exports
    client.ts             # PayVault main client class
    types.ts              # All TypeScript interfaces and types
    errors.ts             # Structured error classes
    http.ts               # HTTP client with retry logic
    utils.ts              # Shared utilities
    providers/
      paystack.ts         # Paystack provider implementation
      flutterwave.ts      # Flutterwave provider implementation
  package.json
  tsconfig.json
```

---

## Contributing

We welcome contributions! Here's how:

1. **Fork** the repo
2. **Create a branch** (`git checkout -b feat/my-feature`)
3. **Write tests** for your changes
4. **Ensure TypeScript compiles** (`npm run build`)
5. **Submit a PR** with a clear description

### Adding a New Provider

1. Create `src/providers/yourprovider.ts`
2. Implement the `Provider` interface
3. Add it to the `BUILTIN_PROVIDERS` registry in `src/client.ts`
4. Export it from `src/index.ts`
5. Add status mappings to `src/utils.ts`
6. Write tests

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Built with care for African developers, by T9ner🧑‍💻.
