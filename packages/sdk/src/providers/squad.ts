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
import { ValidationError, TransactionError, PayVaultError } from '../errors';

const SQUAD_SANDBOX_URL = 'https://sandbox-api-d.squadco.com';
const SQUAD_LIVE_URL = 'https://api-d.squadco.com';

/**
 * Map Squad transaction status to unified status.
 */
function mapSquadStatus(status: string): 'success' | 'failed' | 'pending' | 'abandoned' {
  switch (status?.toLowerCase()) {
    case 'success':
    case 'successful':
      return 'success';
    case 'failed':
    case 'declined':
      return 'failed';
    default:
      return 'pending';
  }
}

export class SquadProvider implements Provider {
  name = 'squad' as const;
  private http: HttpClient;
  private secretKey: string;
  private webhookSecret?: string;
  private baseUrl: string;
  private defaultCurrency: string;
  private defaultMetadata: Record<string, any>;

  constructor(config: PayVaultConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.defaultCurrency = config.currency || 'NGN';
    this.defaultMetadata = config.metadata || {};

    // Sandbox keys start with "sandbox_"
    this.baseUrl = config.baseUrl || (
      config.secretKey.startsWith('sandbox_') ? SQUAD_SANDBOX_URL : SQUAD_LIVE_URL
    );

    this.http = new HttpClient('squad', {
      retry: config.retry,
      timeout: config.timeout,
    });
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.secretKey}`,
    };
  }

  async initializeTransaction(config: TransactionConfig): Promise<TransactionResult> {
    if (!config.email) {
      throw new ValidationError('Email is required', 'squad', 'email');
    }
    if (!config.amount || config.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0', 'squad', 'amount');
    }

    const currency = config.currency || this.defaultCurrency;
    const reference = config.reference || generateReference('pvt_sq');

    const payload: Record<string, any> = {
      email: config.email,
      amount: Math.round(config.amount * 100), // Squad expects amount in kobo
      currency,
      initiate_type: 'inline',
      transaction_ref: reference,
      callback_url: config.callbackUrl || '',
      metadata: { ...this.defaultMetadata, ...config.metadata },
    };

    if (config.customer) {
      payload.customer_name =
        `${config.customer.firstName || ''} ${config.customer.lastName || ''}`.trim();
    }

    const response = await this.http.post(
      `${this.baseUrl}/transaction/initiate`,
      payload,
      this.headers()
    );

    const resData = response.data?.data;

    return {
      success: response.data?.success === true,
      provider: 'squad',
      authorizationUrl: resData?.checkout_url || '',
      accessCode: reference,
      reference,
      raw: response.data,
    };
  }

  async verifyTransaction(reference: string): Promise<VerificationResult> {
    if (!reference) {
      throw new ValidationError('Reference is required', 'squad', 'reference');
    }

    const response = await this.http.get(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      this.headers()
    );

    const data = response.data?.data;
    const currency = data?.currency || this.defaultCurrency;

    return {
      success: mapSquadStatus(data?.transaction_status) === 'success',
      status: mapSquadStatus(data?.transaction_status),
      provider: 'squad',
      reference: data?.transaction_ref || reference,
      amount: data?.amount ? data.amount / 100 : 0, // Convert kobo to major
      currency,
      channel: normalizeChannel(data?.payment_channel?.toLowerCase() || 'card') as any,
      paidAt: data?.paid_at || data?.transaction_date || null,
      customer: {
        email: data?.email || data?.customer_email || '',
        firstName: data?.customer_name?.split(' ')[0],
        lastName: data?.customer_name?.split(' ').slice(1).join(' '),
      },
      fees: data?.merchant_amount ? (data.amount - data.merchant_amount) / 100 : undefined,
      raw: response.data,
    };
  }

  async charge(config: ChargeConfig): Promise<ChargeResult> {
    // Squad doesn't support direct card charges via API — uses checkout redirect
    throw new PayVaultError(
      'Squad does not support direct charges. Use initializeTransaction() for the checkout redirect flow.',
      { code: 'UNSUPPORTED_OPERATION', provider: 'squad' }
    );
  }

  async submitAuthorization(
    _reference: string,
    _auth: { type: string; value: string }
  ): Promise<ChargeResult> {
    throw new PayVaultError(
      'Squad does not support OTP/PIN authorization. All auth is handled via checkout redirect.',
      { code: 'UNSUPPORTED_OPERATION', provider: 'squad' }
    );
  }

  async refund(config: RefundConfig): Promise<RefundResult> {
    if (!config.reference) {
      throw new ValidationError('Reference is required', 'squad', 'reference');
    }

    const payload: Record<string, any> = {
      gateway_transaction_ref: config.reference,
      transaction_ref: config.reference,
      refund_type: 1, // Full refund
      reason_for_refund: config.reason || 'Customer request',
    };

    const response = await this.http.post(
      `${this.baseUrl}/transaction/refund`,
      payload,
      this.headers()
    );

    const resData = response.data?.data;
    const refundRef = resData?.refund_ref || resData?.transaction_ref || config.reference;

    return {
      success: response.data?.success === true,
      provider: 'squad',
      refundReference: refundRef,
      amount: config.amount ?? 0,
      currency: this.defaultCurrency,
      status: 'processed',
      raw: response.data,
    };
  }

  verifyWebhook(payload: string | Buffer, signature: string): boolean {
    const secret = this.webhookSecret || this.secretKey;
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

    const data = body.Body?.data || body.data || body;
    const currency = data.currency || this.defaultCurrency;

    return {
      id: data.transaction_ref || '',
      provider: 'squad',
      type: body.Event || body.event || 'charge_successful',
      reference: data.transaction_ref || data.merchant_ref || '',
      status: mapSquadStatus(data.transaction_status),
      amount: data.amount ? data.amount / 100 : 0,
      currency,
      customer: {
        email: data.email || data.customer_email || '',
        firstName: data.customer_name?.split(' ')[0],
        lastName: data.customer_name?.split(' ').slice(1).join(' '),
      },
      timestamp: data.created_at || data.transaction_date || new Date().toISOString(),
      raw: body,
    };
  }
}
