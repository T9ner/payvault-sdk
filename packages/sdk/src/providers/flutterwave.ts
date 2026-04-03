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
  BulkTransferConfig,
  BulkTransferItem,
  BulkTransferResult,
  VirtualAccountConfig,
  VirtualAccountResult,
} from '../types';
import { HttpClient } from '../http';
import {
  generateReference,
  normalizeStatus,
  normalizeChannel,
  stableReference,
  hmacSha256,
} from '../utils';
import { ValidationError, TransactionError } from '../errors';

const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

export class FlutterwaveProvider implements Provider {
  name = 'flutterwave' as const;
  private http: HttpClient;
  private secretKey: string;
  private webhookSecret?: string;
  private baseUrl: string;
  private defaultCurrency: string;
  private defaultMetadata: Record<string, any>;

  constructor(config: PayVaultConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl || FLUTTERWAVE_BASE_URL;
    this.defaultCurrency = config.currency || 'NGN';
    this.defaultMetadata = config.metadata || {};
    this.http = new HttpClient('flutterwave', {
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
      throw new ValidationError('Email is required', 'flutterwave', 'email');
    }
    if (!config.amount || config.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0', 'flutterwave', 'amount');
    }

    const currency = config.currency || this.defaultCurrency;
    // Use a stable reference when idempotencyKey is provided (deterministic for retries)
    const reference = config.reference
      || (config.idempotencyKey ? stableReference(config.idempotencyKey) : generateReference('pvt_fw'));

    const payload: Record<string, any> = {
      tx_ref: reference,
      amount: config.amount, // Flutterwave uses major units
      currency,
      redirect_url: config.callbackUrl || '',
      customer: {
        email: config.email,
        name: config.customer
          ? `${config.customer.firstName || ''} ${config.customer.lastName || ''}`.trim()
          : undefined,
        phonenumber: config.customer?.phone,
      },
      meta: { ...this.defaultMetadata, ...config.metadata },
      customizations: {
        title: 'Payment',
      },
    };

    if (config.channels) {
      payload.payment_options = config.channels
        .map(ch => this.mapChannel(ch))
        .join(',');
    }

    if (config.split) {
      payload.subaccounts = [
        {
          id: config.split.subaccountCode,
          transaction_charge: config.split.transactionCharge,
          transaction_charge_type:
            config.split.bearer === 'subaccount' ? 'flat_subaccount' : 'flat',
        },
      ];
    }

    // Multi-recipient split (marketplace model)
    if (config.multiSplit && config.multiSplit.recipients.length > 0) {
      payload.subaccounts = config.multiSplit.recipients.map(r => ({
        id: r.subaccountCode,
        transaction_split_ratio: r.shareType === 'percentage' ? Math.round(r.share) : undefined,
        transaction_charge_type: r.shareType === 'flat' ? 'flat' : 'ratio',
        transaction_charge: r.shareType === 'flat' ? r.share : undefined,
      }));
    }

    const response = await this.http.post(
      `${this.baseUrl}/payments`,
      payload,
      this.headers()
    );

    return {
      success: response.data.status === 'success',
      provider: 'flutterwave',
      authorizationUrl: response.data.data.link,
      accessCode: reference, // Flutterwave uses tx_ref as access code
      reference,
      raw: response.data,
    };
  }

  async verifyTransaction(reference: string): Promise<VerificationResult> {
    if (!reference) {
      throw new ValidationError('Reference is required', 'flutterwave', 'reference');
    }

    // Flutterwave verifies by transaction ID, but we can query by tx_ref
    const response = await this.http.get(
      `${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      this.headers()
    );
    const data = response.data.data;
    const currency = data.currency || this.defaultCurrency;

    return {
      success: data.status === 'successful',
      status: normalizeStatus(data.status),
      provider: 'flutterwave',
      reference: data.tx_ref,
      amount: data.amount,
      currency,
      channel: normalizeChannel(data.payment_type) as any,
      paidAt: data.created_at || null,
      customer: {
        email: data.customer?.email,
        firstName: data.customer?.name?.split(' ')[0],
        lastName: data.customer?.name?.split(' ').slice(1).join(' '),
        phone: data.customer?.phone_number,
      },
      authorization: data.card
        ? {
            code: data.card.token || '',
            last4: data.card.last_4digits,
            expMonth: data.card.expiry?.split('/')[0] || '',
            expYear: data.card.expiry?.split('/')[1] || '',
            cardType: data.card.type,
            bank: data.card.issuer || '',
            reusable: !!data.card.token,
            countryCode: data.card.country || '',
          }
        : undefined,
      fees: data.app_fee || undefined,
      raw: response.data,
    };
  }

  async charge(config: ChargeConfig): Promise<ChargeResult> {
    if (!config.email) {
      throw new ValidationError('Email is required', 'flutterwave', 'email');
    }
    if (!config.amount || config.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0', 'flutterwave', 'amount');
    }

    const currency = config.currency || this.defaultCurrency;
    // Use a deterministic reference when an idempotency key is provided
    // This ensures the same charge isn't duplicated on network retries
    const reference = config.idempotencyKey
      ? stableReference(config.idempotencyKey)
      : (config.reference || generateReference('pvt_fw_chg'));

    // Tokenized recurring charge
    if (config.authorizationCode) {
      const payload = {
        token: config.authorizationCode,
        email: config.email,
        amount: config.amount,
        currency,
        tx_ref: reference,
      };
      const response = await this.http.post(
        `${this.baseUrl}/tokenized-charges`,
        payload,
        this.headers()
      );
      return this.parseChargeResponse(response.data, reference);
    }

    // Direct charge via Flutterwave depends on channel
    const payload: Record<string, any> = {
      tx_ref: reference,
      amount: config.amount,
      currency,
      email: config.email,
      meta: config.metadata,
    };

    let endpoint = `${this.baseUrl}/charges`;
    const queryParams: string[] = [];

    switch (config.channel) {
      case 'card':
        queryParams.push('type=card');
        // Note: In production, card details must be encrypted with Flutterwave's encryption key
        if (config.card) {
          payload.card_number = config.card.number;
          payload.cvv = config.card.cvv;
          payload.expiry_month = config.card.expMonth;
          payload.expiry_year = config.card.expYear;
        }
        break;
      case 'bank_transfer':
        queryParams.push('type=bank_transfer');
        break;
      case 'ussd':
        queryParams.push('type=ussd');
        if (config.bank) payload.account_bank = config.bank.code;
        break;
      case 'mobile_money':
        queryParams.push('type=mobile_money_ghana'); // Adjust per country
        break;
      default:
        queryParams.push(`type=${config.channel}`);
    }

    const url = queryParams.length
      ? `${endpoint}?${queryParams.join('&')}`
      : endpoint;
    const response = await this.http.post(url, payload, this.headers());
    return this.parseChargeResponse(response.data, reference);
  }

  async submitAuthorization(
    reference: string,
    auth: { type: string; value: string }
  ): Promise<ChargeResult> {
    const payload: Record<string, any> = {
      flw_ref: reference,
    };

    if (auth.type === 'otp') {
      payload.otp = auth.value;
    } else if (auth.type === 'pin') {
      payload.pin = auth.value;
    }

    const response = await this.http.post(
      `${this.baseUrl}/validate-charge`,
      payload,
      this.headers()
    );
    return this.parseChargeResponse(response.data, reference);
  }

  async refund(config: RefundConfig): Promise<RefundResult> {
    if (!config.reference) {
      throw new ValidationError('Reference is required', 'flutterwave', 'reference');
    }

    // First get the Flutterwave transaction ID
    const verification = await this.verifyTransaction(config.reference);
    const transactionId = verification.raw?.data?.id;
    if (!transactionId) {
      throw new TransactionError(
        'Could not find transaction to refund',
        'flutterwave',
        config.reference
      );
    }

    const currency = verification.currency;
    const payload: Record<string, any> = {};
    if (config.amount) payload.amount = config.amount;
    if (config.reason) payload.comments = config.reason;

    const response = await this.http.post(
      `${this.baseUrl}/transactions/${transactionId}/refund`,
      payload,
      this.headers()
    );
    const data = response.data.data;

    return {
      success: response.data.status === 'success',
      provider: 'flutterwave',
      refundReference: data.id?.toString() || '',
      amount: data.amount_refunded || config.amount || verification.amount,
      currency,
      status: data.status === 'completed' ? 'processed' : 'pending',
      raw: response.data,
    };
  }

  async bulkTransfer(config: BulkTransferConfig): Promise<BulkTransferResult> {
    const currency = this.defaultCurrency;

    const bulk_data = config.recipients.map((recipient) => ({
      bank_code: recipient.bankCode,
      account_number: recipient.accountNumber,
      amount: recipient.amount,
      currency: recipient.currency ?? currency,
      narration: recipient.narration ?? config.title ?? 'PayVault bulk transfer',
      reference: recipient.reference ?? generateReference(),
    }));

    const response = await this.http.post(
      `${this.baseUrl}/bulk-transfers`,
      {
        title: config.title ?? 'PayVault bulk transfer',
        bulk_data,
      },
      this.headers()
    );
    const result = response.data.data;

    const items: BulkTransferItem[] = config.recipients.map((recipient, index) => ({
      reference: bulk_data[index].reference,
      accountNumber: recipient.accountNumber,
      bankCode: recipient.bankCode,
      accountName: recipient.accountName,
      amount: recipient.amount,
      currency: recipient.currency ?? currency,
      narration: recipient.narration,
      status: 'pending',
    }));

    return {
      batchReference: String(result.id),
      status: 'pending',
      items,
      total: items.length,
      successCount: 0,
      failedCount: 0,
      rawResponse: response.data,
    };
  }

  verifyWebhook(payload: string | Buffer, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const payloadStr =
      typeof payload === 'string' ? payload : payload.toString('utf8');
    const hash = hmacSha256(payloadStr, this.webhookSecret);
    const computedSignature = Buffer.from(hash).toString('base64');
    return computedSignature === signature;
  }

  parseWebhook(payload: string | Buffer): WebhookEvent {
    const body =
      typeof payload === 'string'
        ? JSON.parse(payload)
        : JSON.parse(payload.toString('utf8'));
    const data = body.data;

    return {
      id: data.id?.toString() || body.id || '',
      provider: 'flutterwave',
      type: body.event || body.type || 'charge.completed',
      reference: data.tx_ref || data.reference || '',
      status: normalizeStatus(data.status),
      amount: data.amount || 0,
      currency: data.currency || this.defaultCurrency,
      customer: {
        email: data.customer?.email,
        firstName: data.customer?.name?.split(' ')[0],
        lastName: data.customer?.name?.split(' ').slice(1).join(' '),
        phone: data.customer?.phone_number,
      },
      timestamp: body.timestamp
        ? new Date(body.timestamp).toISOString()
        : new Date().toISOString(),
      raw: body,
    };
  }

  // Map unified channel names to Flutterwave payment_options
  private mapChannel(channel: string): string {
    const map: Record<string, string> = {
      card: 'card',
      bank_transfer: 'banktransfer',
      ussd: 'ussd',
      mobile_money: 'mobilemoney',
      qr: 'qr',
      apple_pay: 'applepay',
      google_pay: 'googlepay',
    };
    return map[channel] || channel;
  }

  // Parse Flutterwave charge response into unified format
  private parseChargeResponse(responseData: any, reference: string): ChargeResult {
    const data = responseData.data || {};
    const meta = responseData.meta || {};
    const status = normalizeStatus(
      data.status || responseData.status || 'pending'
    );

    let requiresAuth = false;
    let authType: ChargeResult['authType'] = 'none';
    let authMessage: string | undefined;
    let authUrl: string | undefined;

    // Check meta.authorization for required auth action
    if (meta.authorization) {
      requiresAuth = true;
      const authMode = meta.authorization.mode;
      if (authMode === 'pin') authType = 'pin';
      else if (authMode === 'otp') authType = 'otp';
      else if (authMode === 'redirect') {
        authType = 'redirect';
        authUrl = meta.authorization.redirect;
      } else if (authMode === 'avs_noauth' || authMode === 'avs') {
        authType = 'address';
      }
      authMessage = responseData.message;
    }

    return {
      success: status === 'success',
      status,
      provider: 'flutterwave',
      reference: data.tx_ref || data.flw_ref || reference,
      requiresAuth,
      authType,
      authUrl,
      authMessage,
      raw: responseData,
    };
  }

  async createVirtualAccount(config: VirtualAccountConfig): Promise<VirtualAccountResult> {
    const reference = config.reference || generateReference('pvt_va');

    const payload: Record<string, any> = {
      email: config.email,
      is_permanent: true,
      bvn: config.bvn,
      tx_ref: reference,
      narration: config.narration,
      currency: config.currency || this.defaultCurrency,
    };
    if (config.firstName) payload.firstname = config.firstName;
    if (config.lastName) payload.lastname = config.lastName;
    if (config.phone) payload.phonenumber = config.phone;

    const response = await this.http.post(
      `${this.baseUrl}/virtual-account-numbers`,
      payload,
      this.headers()
    );
    const data = response.data.data;

    return {
      success: response.data.status === 'success',
      provider: 'flutterwave',
      accountNumber: data.account_number,
      accountName: data.account_name,
      bankName: data.bank_name || '',
      reference: data.order_ref || reference,
      expiresAt: data.expiry_date || null,
      raw: response.data,
    };
  }
}
