import type {
  Provider,
  TransactionConfig,
  TransactionResult,
  VerificationResult,
  ChargeConfig,
  ChargeResult,
  RefundConfig,
  RefundResult,
  WebhookEvent,
  PayVaultConfig,
} from '../types';
import { HttpClient } from '../http';
import {
  generateReference,
  normalizeStatus,
  normalizeChannel,
  hmacSha512,
} from '../utils';
import { ValidationError, TransactionError, PayVaultError, ProviderError } from '../errors';

const MONNIFY_SANDBOX_URL = 'https://sandbox.monnify.com/api';
const MONNIFY_LIVE_URL = 'https://api.monnify.com/api';

/**
 * Parse pipe-delimited Monnify credentials.
 * Format: `apiKey|secretKey|contractCode`
 */
function parseMonnifyCredentials(secret: string): {
  apiKey: string;
  secretKey: string;
  contractCode: string;
} {
  const parts = secret.split('|');
  if (parts.length !== 3) {
    throw new PayVaultError(
      'Monnify credentials must be in the format: apiKey|secretKey|contractCode',
      { code: 'VALIDATION_ERROR', provider: 'monnify' }
    );
  }
  const [apiKey, secretKey, contractCode] = parts.map(p => p.trim());
  if (!apiKey || !secretKey || !contractCode) {
    throw new PayVaultError(
      'Monnify credentials must include apiKey, secretKey, and contractCode',
      { code: 'VALIDATION_ERROR', provider: 'monnify' }
    );
  }
  return { apiKey, secretKey, contractCode };
}

/**
 * Map Monnify payment status to unified status.
 */
function mapMonnifyStatus(status: string): 'success' | 'failed' | 'pending' | 'abandoned' {
  switch (status?.toUpperCase()) {
    case 'PAID':
    case 'OVERPAID':
      return 'success';
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELLED':
      return 'failed';
    default:
      return 'pending';
  }
}

export class MonnifyProvider implements Provider {
  name = 'monnify' as const;
  private http: HttpClient;
  private rawSecret: string;
  private webhookSecret?: string;
  private baseUrl: string;
  private defaultCurrency: string;
  private defaultMetadata: Record<string, any>;

  constructor(config: PayVaultConfig) {
    this.rawSecret = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.defaultCurrency = config.currency || 'NGN';
    this.defaultMetadata = config.metadata || {};

    // Determine base URL: test keys start with MK_TEST_
    const { apiKey } = parseMonnifyCredentials(config.secretKey);
    this.baseUrl = config.baseUrl || (apiKey.startsWith('MK_TEST_') ? MONNIFY_SANDBOX_URL : MONNIFY_LIVE_URL);

    this.http = new HttpClient('monnify', {
      retry: config.retry,
      timeout: config.timeout,
    });
  }

  /**
   * Fetch an access token using Basic Auth (apiKey:secretKey → base64).
   * Monnify requires this on every request cycle.
   */
  private async fetchAccessToken(): Promise<string> {
    const { apiKey, secretKey } = parseMonnifyCredentials(this.rawSecret);
    const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

    const response = await this.http.post(
      `${this.baseUrl}/v1/auth/login`,
      {},
      { 'Authorization': `Basic ${credentials}` }
    );

    const token: string = response.data?.responseBody?.accessToken;
    if (!token) {
      throw new ProviderError('Failed to obtain Monnify access token', 'monnify', 401, response.data);
    }
    return token;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.fetchAccessToken();
    return { 'Authorization': `Bearer ${token}` };
  }

  async initializeTransaction(config: TransactionConfig): Promise<TransactionResult> {
    if (!config.email) {
      throw new ValidationError('Email is required', 'monnify', 'email');
    }
    if (!config.amount || config.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0', 'monnify', 'amount');
    }

    const { contractCode } = parseMonnifyCredentials(this.rawSecret);
    const currency = config.currency || this.defaultCurrency;
    const reference = config.reference || generateReference('pvt_mn');

    const payload: Record<string, any> = {
      amount: config.amount, // Monnify uses major units (naira, not kobo)
      customerName: config.customer
        ? `${config.customer.firstName || ''} ${config.customer.lastName || ''}`.trim() || config.email
        : config.email,
      customerEmail: config.email,
      paymentReference: reference,
      paymentDescription: 'Payment',
      currencyCode: currency,
      contractCode,
      redirectUrl: config.callbackUrl || '',
      paymentMethods: ['CARD', 'ACCOUNT_TRANSFER'],
      metaData: { ...this.defaultMetadata, ...config.metadata },
    };

    if (config.channels) {
      payload.paymentMethods = config.channels.map(ch => this.mapChannel(ch));
    }

    const headers = await this.authHeaders();
    const response = await this.http.post(
      `${this.baseUrl}/v1/merchant/transactions/init-transaction`,
      payload,
      headers
    );

    const resData = response.data?.responseBody;

    return {
      success: response.data?.requestSuccessful === true,
      provider: 'monnify',
      authorizationUrl: resData?.checkoutUrl || '',
      accessCode: reference,
      reference,
      raw: response.data,
    };
  }

  async verifyTransaction(reference: string): Promise<VerificationResult> {
    if (!reference) {
      throw new ValidationError('Reference is required', 'monnify', 'reference');
    }

    const headers = await this.authHeaders();
    // Monnify expects URL-encoded transactionReference
    const response = await this.http.get(
      `${this.baseUrl}/v2/transactions/${encodeURIComponent(reference)}`,
      headers
    );
    const data = response.data?.responseBody;
    const currency = data?.currencyCode || this.defaultCurrency;

    return {
      success: mapMonnifyStatus(data?.paymentStatus) === 'success',
      status: mapMonnifyStatus(data?.paymentStatus),
      provider: 'monnify',
      reference: data?.paymentReference || reference,
      amount: data?.amountPaid ?? data?.amount ?? 0,
      currency,
      channel: normalizeChannel(data?.paymentMethod?.toLowerCase() || 'card') as any,
      paidAt: data?.paidOn || null,
      customer: {
        email: data?.customer?.email || data?.customerEmail || '',
        firstName: data?.customer?.name?.split(' ')[0],
        lastName: data?.customer?.name?.split(' ').slice(1).join(' '),
      },
      fees: data?.payableAmount ? data.payableAmount - (data.amountPaid ?? 0) : undefined,
      raw: response.data,
    };
  }

  async charge(config: ChargeConfig): Promise<ChargeResult> {
    // Monnify doesn't support direct charges (no card tokenization via API)
    // All payments go through the redirect/checkout flow
    throw new PayVaultError(
      'Monnify does not support direct charges. Use initializeTransaction() for the checkout redirect flow.',
      { code: 'UNSUPPORTED_OPERATION', provider: 'monnify' }
    );
  }

  async submitAuthorization(
    _reference: string,
    _auth: { type: string; value: string }
  ): Promise<ChargeResult> {
    throw new PayVaultError(
      'Monnify does not support OTP/PIN authorization. All auth is handled via checkout redirect.',
      { code: 'UNSUPPORTED_OPERATION', provider: 'monnify' }
    );
  }

  async refund(_config: RefundConfig): Promise<RefundResult> {
    throw new PayVaultError(
      'Monnify refunds must be processed manually via the Monnify merchant dashboard.',
      { code: 'UNSUPPORTED_OPERATION', provider: 'monnify' }
    );
  }

  verifyWebhook(payload: string | Buffer, signature: string): boolean {
    const { secretKey } = parseMonnifyCredentials(this.rawSecret);
    const secret = this.webhookSecret || secretKey;
    const hash = hmacSha512(
      typeof payload === 'string' ? payload : payload.toString('utf8'),
      secret
    );
    return hash === signature.toLowerCase();
  }

  parseWebhook(payload: string | Buffer): WebhookEvent {
    const body =
      typeof payload === 'string'
        ? JSON.parse(payload)
        : JSON.parse(payload.toString('utf8'));

    const data = body.eventData || body.responseBody || {};
    const currency = data.currency || data.currencyCode || this.defaultCurrency;

    return {
      id: data.transactionReference || '',
      provider: 'monnify',
      type: body.eventType || 'SUCCESSFUL_TRANSACTION',
      reference: data.paymentReference || data.transactionReference || '',
      status: mapMonnifyStatus(data.paymentStatus),
      amount: data.amountPaid ?? data.settlementAmount ?? 0,
      currency,
      customer: {
        email: data.customer?.email || data.customerEmail || '',
        firstName: data.customer?.name?.split(' ')[0],
        lastName: data.customer?.name?.split(' ').slice(1).join(' '),
      },
      timestamp: data.paidOn || new Date().toISOString(),
      raw: body,
    };
  }

  private mapChannel(channel: string): string {
    const map: Record<string, string> = {
      card: 'CARD',
      bank_transfer: 'ACCOUNT_TRANSFER',
      ussd: 'USSD',
      mobile_money: 'PHONE_NUMBER',
    };
    return map[channel] || channel.toUpperCase();
  }
}
