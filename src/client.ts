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
  WebhookHandler,
  SubscriptionConfig,
  SubscriptionResult,
  ProviderName,
} from './types';
import { PaystackProvider } from './providers/paystack';
import { FlutterwaveProvider } from './providers/flutterwave';
import { PayVaultError } from './errors';

// Provider registry
const BUILTIN_PROVIDERS: Record<string, new (config: PayVaultConfig) => Provider> = {
  paystack: PaystackProvider,
  flutterwave: FlutterwaveProvider,
};

export class PayVault {
  private provider: Provider;
  private config: PayVaultConfig;
  private webhookHandlers: Map<string, WebhookHandler[]> = new Map();

  constructor(config: PayVaultConfig) {
    this.config = config;

    // Resolve provider
    const ProviderClass = BUILTIN_PROVIDERS[config.provider];
    if (!ProviderClass) {
      throw new PayVaultError(
        `Unknown provider: ${config.provider}. Available: ${Object.keys(BUILTIN_PROVIDERS).join(', ')}`,
        {
          code: 'INVALID_PROVIDER',
          provider: config.provider,
        }
      );
    }

    this.provider = new ProviderClass(config);
  }

  // ========== STATIC FACTORY METHODS ==========

  /** Create a PayVault instance configured for Paystack */
  static paystack(
    secretKey: string,
    options?: Partial<Omit<PayVaultConfig, 'provider' | 'secretKey'>>
  ): PayVault {
    return new PayVault({ provider: 'paystack', secretKey, ...options });
  }

  /** Create a PayVault instance configured for Flutterwave */
  static flutterwave(
    secretKey: string,
    options?: Partial<Omit<PayVaultConfig, 'provider' | 'secretKey'>>
  ): PayVault {
    return new PayVault({ provider: 'flutterwave', secretKey, ...options });
  }

  // ========== TRANSACTIONS ==========

  /**
   * Initialize a payment transaction.
   * Returns an authorization URL to redirect the customer to.
   *
   * @example
   * const tx = await vault.initializeTransaction({
   *   amount: 5000,
   *   email: 'customer@example.com',
   * });
   * // Redirect to tx.authorizationUrl
   */
  async initializeTransaction(config: TransactionConfig): Promise<TransactionResult> {
    return this.provider.initializeTransaction(config);
  }

  /**
   * Verify a transaction by reference.
   * Always verify server-side before delivering value.
   *
   * @example
   * const result = await vault.verifyTransaction('pvt_abc123');
   * if (result.success) {
   *   // Deliver the goods
   * }
   */
  async verifyTransaction(reference: string): Promise<VerificationResult> {
    return this.provider.verifyTransaction(reference);
  }

  // ========== CHARGES ==========

  /**
   * Direct charge (card, bank, authorization code for recurring).
   * For recurring charges, pass authorizationCode from a previous successful transaction.
   *
   * @example
   * // Recurring charge
   * const result = await vault.charge({
   *   amount: 5000,
   *   email: 'customer@example.com',
   *   channel: 'card',
   *   authorizationCode: 'AUTH_abc123',
   * });
   */
  async charge(config: ChargeConfig): Promise<ChargeResult> {
    return this.provider.charge(config);
  }

  /**
   * Submit authorization response (OTP, PIN, etc.) after a charge requires it.
   *
   * @example
   * const chargeResult = await vault.charge({...});
   * if (chargeResult.requiresAuth && chargeResult.authType === 'otp') {
   *   const otp = await getOtpFromUser();
   *   const result = await vault.submitAuthorization(chargeResult.reference, {
   *     type: 'otp',
   *     value: otp,
   *   });
   * }
   */
  async submitAuthorization(
    reference: string,
    auth: { type: string; value: string }
  ): Promise<ChargeResult> {
    return this.provider.submitAuthorization(reference, auth);
  }

  // ========== REFUNDS ==========

  /**
   * Refund a transaction (full or partial).
   *
   * @example
   * const refund = await vault.refund({
   *   reference: 'pvt_abc123',
   *   amount: 2500,  // Partial refund. Omit for full refund.
   *   reason: 'Customer requested',
   * });
   */
  async refund(config: RefundConfig): Promise<RefundResult> {
    return this.provider.refund(config);
  }

  // ========== SUBSCRIPTIONS ==========

  /**
   * Create a subscription for a customer on a plan.
   */
  async createSubscription(config: SubscriptionConfig): Promise<SubscriptionResult> {
    if (!this.provider.createSubscription) {
      throw new PayVaultError('Subscriptions not supported by this provider', {
        code: 'NOT_SUPPORTED',
        provider: this.provider.name,
      });
    }
    return this.provider.createSubscription(config);
  }

  /**
   * Cancel a subscription.
   */
  async cancelSubscription(code: string): Promise<{ success: boolean }> {
    if (!this.provider.cancelSubscription) {
      throw new PayVaultError('Subscriptions not supported by this provider', {
        code: 'NOT_SUPPORTED',
        provider: this.provider.name,
      });
    }
    return this.provider.cancelSubscription(code);
  }

  // ========== WEBHOOKS ==========

  /**
   * Verify a webhook signature.
   * Call this before processing any webhook to prevent spoofing.
   *
   * @example
   * app.post('/webhooks/payvault', (req, res) => {
   *   const signature = req.headers['x-paystack-signature'] || req.headers['verif-hash'];
   *   const isValid = vault.verifyWebhook(req.rawBody, signature);
   *   if (!isValid) return res.status(401).send('Invalid signature');
   *
   *   const event = vault.parseWebhook(req.rawBody);
   *   // Handle event...
   *   res.status(200).send('OK');
   * });
   */
  verifyWebhook(payload: string | Buffer, signature: string): boolean {
    return this.provider.verifyWebhook(payload, signature);
  }

  /**
   * Parse a webhook payload into a unified event object.
   */
  parseWebhook(payload: string | Buffer): WebhookEvent {
    return this.provider.parseWebhook(payload);
  }

  /**
   * Register a handler for a specific webhook event type.
   * Use '*' as event type to handle all events.
   *
   * @example
   * vault.on('charge.success', async (event) => {
   *   console.log(`Payment received: ${event.amount} ${event.currency}`);
   * });
   *
   * vault.on('*', async (event) => {
   *   // Log all webhook events
   *   console.log(`[${event.type}] ${event.reference}`);
   * });
   */
  on(eventType: string, handler: WebhookHandler): void {
    const handlers = this.webhookHandlers.get(eventType) || [];
    handlers.push(handler);
    this.webhookHandlers.set(eventType, handlers);
  }

  /**
   * Process a webhook event, dispatching to registered handlers.
   * Verifies the signature, parses the payload, and calls matching handlers.
   * Returns the parsed event.
   *
   * @example
   * app.post('/webhooks', async (req, res) => {
   *   try {
   *     const event = await vault.handleWebhook(req.rawBody, signature);
   *     res.status(200).json({ received: true, type: event.type });
   *   } catch (err) {
   *     res.status(401).json({ error: 'Invalid webhook' });
   *   }
   * });
   */
  async handleWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent> {
    if (!this.verifyWebhook(payload, signature)) {
      throw new PayVaultError('Invalid webhook signature', {
        code: 'WEBHOOK_VERIFICATION_FAILED',
        provider: this.provider.name,
      });
    }

    const event = this.parseWebhook(payload);

    // Dispatch to type-specific handlers
    const handlers = this.webhookHandlers.get(event.type) || [];
    const wildcardHandlers = this.webhookHandlers.get('*') || [];

    await Promise.all([
      ...handlers.map(h => h(event)),
      ...wildcardHandlers.map(h => h(event)),
    ]);

    return event;
  }

  // ========== UTILITIES ==========

  /** Get the underlying provider name */
  get providerName(): ProviderName {
    return this.provider.name;
  }

  /** Register a custom provider at runtime */
  static registerProvider(
    name: string,
    providerClass: new (config: PayVaultConfig) => Provider
  ): void {
    BUILTIN_PROVIDERS[name] = providerClass;
  }
}
