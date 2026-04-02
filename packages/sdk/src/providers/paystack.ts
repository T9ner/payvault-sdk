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
  SubscriptionConfig,
  SubscriptionResult,
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
  toMinorUnits,
  toMajorUnits,
  normalizeStatus,
  normalizeChannel,
  hmacSha512,
} from '../utils';
import { ValidationError, TransactionError } from '../errors';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export class PaystackProvider implements Provider {
  name = 'paystack' as const;
  private http: HttpClient;
  private secretKey: string;
  private webhookSecret?: string;
  private baseUrl: string;
  private defaultCurrency: string;
  private defaultMetadata: Record<string, any>;

  constructor(config: PayVaultConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl || PAYSTACK_BASE_URL;
    this.defaultCurrency = config.currency || 'NGN';
    this.defaultMetadata = config.metadata || {};
    this.http = new HttpClient('paystack', {
      retry: config.retry,
      timeout: config.timeout,
    });
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    const h: Record<string, string> = {
      'Authorization': `Bearer ${this.secretKey}`,
    };
    if (idempotencyKey) {
      h['Idempotency-Key'] = idempotencyKey;
    }
    return h;
  }

  async initializeTransaction(config: TransactionConfig): Promise<TransactionResult> {
    if (!config.email) {
      throw new ValidationError('Email is required', 'paystack', 'email');
    }
    if (!config.amount || config.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0', 'paystack', 'amount');
    }

    const currency = config.currency || this.defaultCurrency;
    const reference = config.reference || generateReference('pvt_ps');

    const payload: Record<string, any> = {
      amount: toMinorUnits(config.amount, currency),
      email: config.email,
      currency,
      reference,
      metadata: { ...this.defaultMetadata, ...config.metadata },
    };

    if (config.callbackUrl) payload.callback_url = config.callbackUrl;
    if (config.channels) payload.channels = config.channels.map(ch => this.mapChannel(ch));
    if (config.plan) payload.plan = config.plan;

    if (config.split) {
      payload.subaccount = config.split.subaccountCode;
      if (config.split.transactionCharge !== undefined) {
        payload.transaction_charge = toMinorUnits(config.split.transactionCharge, currency);
      }
      if (config.split.bearer) payload.bearer = config.split.bearer;
    }

    // Multi-recipient split (marketplace model)
    if (config.multiSplit && config.multiSplit.recipients.length > 0) {
      payload.split = {
        type: config.multiSplit.recipients[0]?.shareType === 'flat' ? 'flat' : 'percentage',
        bearer_type: config.multiSplit.bearer || 'account',
        subaccounts: config.multiSplit.recipients.map(r => ({
          subaccount: r.subaccountCode,
          share: r.shareType === 'percentage'
            ? Math.round(r.share)
            : toMinorUnits(r.share, currency),
        })),
      };
    }

    const response = await this.http.post(
      `${this.baseUrl}/transaction/initialize`,
      payload,
      this.headers(config.idempotencyKey)
    );

    return {
      success: response.data.status === true,
      provider: 'paystack',
      authorizationUrl: response.data.data.authorization_url,
      accessCode: response.data.data.access_code,
      reference: response.data.data.reference,
      raw: response.data,
    };
  }

  async verifyTransaction(reference: string): Promise<VerificationResult> {
    if (!reference) {
      throw new ValidationError('Reference is required', 'paystack', 'reference');
    }

    const response = await this.http.get(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      this.headers()
    );
    const data = response.data.data;
    const currency = data.currency || this.defaultCurrency;

    return {
      success: data.status === 'success',
      status: normalizeStatus(data.status),
      provider: 'paystack',
      reference: data.reference,
      amount: toMajorUnits(data.amount, currency),
      currency,
      channel: normalizeChannel(data.channel) as any,
      paidAt: data.paid_at || null,
      customer: {
        email: data.customer?.email,
        firstName: data.customer?.first_name,
        lastName: data.customer?.last_name,
        phone: data.customer?.phone,
      },
      authorization: data.authorization
        ? {
            code: data.authorization.authorization_code,
            last4: data.authorization.last4,
            expMonth: data.authorization.exp_month,
            expYear: data.authorization.exp_year,
            cardType: data.authorization.card_type,
            bank: data.authorization.bank,
            reusable: data.authorization.reusable,
            countryCode: data.authorization.country_code,
          }
        : undefined,
      fees: data.fees ? toMajorUnits(data.fees, currency) : undefined,
      raw: response.data,
    };
  }

  async charge(config: ChargeConfig): Promise<ChargeResult> {
    if (!config.email) {
      throw new ValidationError('Email is required', 'paystack', 'email');
    }
    if (!config.amount || config.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0', 'paystack', 'amount');
    }

    const currency = config.currency || this.defaultCurrency;
    const reference = config.reference || generateReference('pvt_ps_chg');

    // Recurring charge with authorization code
    if (config.authorizationCode) {
      const payload = {
        authorization_code: config.authorizationCode,
        email: config.email,
        amount: toMinorUnits(config.amount, currency),
        currency,
        reference,
        metadata: config.metadata,
      };
      const response = await this.http.post(
        `${this.baseUrl}/transaction/charge_authorization`,
        payload,
        this.headers(config.idempotencyKey)
      );
      return this.parseChargeResponse(response.data, reference);
    }

    // Direct charge
    const payload: Record<string, any> = {
      email: config.email,
      amount: toMinorUnits(config.amount, currency),
      reference,
      metadata: config.metadata,
    };

    if (config.bank) {
      payload.bank = {
        code: config.bank.code,
        account_number: config.bank.accountNumber,
      };
    }

    const response = await this.http.post(
      `${this.baseUrl}/charge`,
      payload,
      this.headers(config.idempotencyKey)
    );
    return this.parseChargeResponse(response.data, reference);
  }

  async submitAuthorization(
    reference: string,
    auth: { type: string; value: string }
  ): Promise<ChargeResult> {
    const payload: Record<string, any> = { reference };

    switch (auth.type) {
      case 'otp':
        payload.otp = auth.value;
        break;
      case 'pin':
        payload.pin = auth.value;
        break;
      case 'phone':
        payload.phone = auth.value;
        break;
      case 'birthday':
        payload.birthday = auth.value;
        break;
      default:
        throw new ValidationError(
          `Unknown authorization type: ${auth.type}`,
          'paystack',
          'auth.type'
        );
    }

    const response = await this.http.post(
      `${this.baseUrl}/charge/submit_${auth.type}`,
      payload,
      this.headers()
    );
    return this.parseChargeResponse(response.data, reference);
  }

  async refund(config: RefundConfig): Promise<RefundResult> {
    if (!config.reference) {
      throw new ValidationError('Reference is required', 'paystack', 'reference');
    }

    // First verify to get transaction ID
    const verification = await this.verifyTransaction(config.reference);
    const transactionId = verification.raw?.data?.id;
    if (!transactionId) {
      throw new TransactionError(
        'Could not find transaction to refund',
        'paystack',
        config.reference
      );
    }

    const currency = verification.currency;
    const payload: Record<string, any> = {
      transaction: transactionId,
    };
    if (config.amount) payload.amount = toMinorUnits(config.amount, currency);
    if (config.reason) payload.merchant_note = config.reason;

    const response = await this.http.post(
      `${this.baseUrl}/refund`,
      payload,
      this.headers()
    );
    const data = response.data.data;

    return {
      success: response.data.status === true,
      provider: 'paystack',
      refundReference: data.id?.toString() || '',
      amount: toMajorUnits(data.amount, currency),
      currency,
      status:
        data.status === 'processed'
          ? 'processed'
          : data.status === 'pending'
            ? 'pending'
            : 'failed',
      raw: response.data,
    };
  }

  async bulkTransfer(config: BulkTransferConfig): Promise<BulkTransferResult> {
    const currency = this.defaultCurrency;
    const recipientsWithCodes: Array<{ recipientCode: string }> = [];

    for (let index = 0; index < config.recipients.length; index += 10) {
      const chunk = config.recipients.slice(index, index + 10);
      const chunkResults = await Promise.all(
        chunk.map(async (recipient) => {
          const response = await this.http.post(
            `${this.baseUrl}/transferrecipient`,
            {
              type: 'nuban',
              name: recipient.accountName,
              account_number: recipient.accountNumber,
              bank_code: recipient.bankCode,
              currency: recipient.currency ?? currency,
            },
            this.headers()
          );

          return {
            recipientCode: response.data.data.recipient_code,
          };
        })
      );
      recipientsWithCodes.push(...chunkResults);
    }

    const transfers = config.recipients.map((recipient, index) => ({
      amount: toMinorUnits(recipient.amount, recipient.currency ?? currency),
      recipient: recipientsWithCodes[index].recipientCode,
      reason: recipient.narration ?? config.title ?? 'PayVault bulk transfer',
      reference: recipient.reference ?? generateReference(),
    }));

    const response = await this.http.post(
      `${this.baseUrl}/transfer/bulk`,
      {
        source: config.source ?? 'balance',
        transfers,
      },
      this.headers()
    );
    const result = Array.isArray(response.data.data) ? response.data.data : [];

    const items: BulkTransferItem[] = config.recipients.map((recipient, index) => ({
      reference: transfers[index].reference,
      accountNumber: recipient.accountNumber,
      bankCode: recipient.bankCode,
      accountName: recipient.accountName,
      amount: recipient.amount,
      currency: recipient.currency ?? currency,
      narration: recipient.narration,
      status:
        result[index]?.status === 'success'
          ? 'success'
          : result[index]?.status === 'failed'
            ? 'failed'
            : 'pending',
      failureReason: result[index]?.failure_reason ?? result[index]?.reason,
      providerReference: result[index]?.transfer_code,
    }));

    const successCount = items.filter(item => item.status === 'success').length;
    const failedCount = items.filter(item => item.status === 'failed').length;

    return {
      batchReference: result[0]?.transfer_code ?? generateReference(),
      status:
        failedCount === items.length
          ? 'failed'
          : failedCount === 0
            ? 'success'
            : 'pending',
      items,
      total: items.length,
      successCount,
      failedCount,
      rawResponse: response.data,
    };
  }

  verifyWebhook(payload: string | Buffer, signature: string): boolean {
    const secret = this.webhookSecret || this.secretKey;
    const hash = hmacSha512(
      typeof payload === 'string' ? payload : payload.toString('utf8'),
      secret
    );
    return hash === signature;
  }

  parseWebhook(payload: string | Buffer): WebhookEvent {
    const body =
      typeof payload === 'string'
        ? JSON.parse(payload)
        : JSON.parse(payload.toString('utf8'));
    const data = body.data;
    const currency = data.currency || this.defaultCurrency;

    return {
      id: data.id?.toString() || '',
      provider: 'paystack',
      type: body.event,
      reference: data.reference,
      status: normalizeStatus(data.status),
      amount: toMajorUnits(data.amount, currency),
      currency,
      customer: {
        email: data.customer?.email,
        firstName: data.customer?.first_name,
        lastName: data.customer?.last_name,
        phone: data.customer?.phone,
      },
      timestamp: data.paid_at || data.created_at || new Date().toISOString(),
      raw: body,
    };
  }

  async createSubscription(config: SubscriptionConfig): Promise<SubscriptionResult> {
    const payload = {
      customer: config.email,
      plan: config.planCode,
      start_date: config.startDate,
      metadata: config.metadata,
    };

    const response = await this.http.post(
      `${this.baseUrl}/subscription`,
      payload,
      this.headers()
    );
    const data = response.data.data;

    return {
      success: response.data.status === true,
      provider: 'paystack',
      subscriptionCode: data.subscription_code,
      planCode: data.plan?.plan_code || config.planCode,
      status: data.status === 'active' ? 'active' : 'pending',
      nextPaymentDate: data.next_payment_date || null,
      raw: response.data,
    };
  }

  async cancelSubscription(code: string): Promise<{ success: boolean }> {
    // Paystack requires email token + subscription code
    const response = await this.http.post(
      `${this.baseUrl}/subscription/disable`,
      {
        code,
        token: code, // In production, this should be the email token
      },
      this.headers()
    );

    return { success: response.data.status === true };
  }

  // Map unified channel names to Paystack channel names
  private mapChannel(channel: string): string {
    const map: Record<string, string> = {
      card: 'card',
      bank_transfer: 'bank_transfer',
      ussd: 'ussd',
      mobile_money: 'mobile_money',
      qr: 'qr',
      apple_pay: 'apple_pay',
    };
    return map[channel] || channel;
  }

  // Parse Paystack charge response into unified format
  private parseChargeResponse(responseData: any, reference: string): ChargeResult {
    const data = responseData.data;
    const status = normalizeStatus(data.status);

    // Determine if further auth is needed
    let requiresAuth = false;
    let authType: ChargeResult['authType'] = 'none';
    let authMessage: string | undefined;
    let authUrl: string | undefined;

    if (
      data.status === 'send_otp' ||
      data.status === 'open_url' ||
      data.status === 'send_pin' ||
      data.status === 'send_phone' ||
      data.status === 'send_birthday' ||
      data.status === 'send_address'
    ) {
      requiresAuth = true;
      if (data.status === 'send_otp') authType = 'otp';
      else if (data.status === 'send_pin') authType = 'pin';
      else if (data.status === 'open_url') {
        authType = 'redirect';
        authUrl = data.url;
      } else if (data.status === 'send_phone') authType = 'phone';
      else if (data.status === 'send_birthday') authType = 'birthday';
      authMessage = data.display_text || data.message || responseData.message;
    }

    return {
      success: status === 'success',
      status,
      provider: 'paystack',
      reference: data.reference || reference,
      requiresAuth,
      authType,
      authUrl,
      authMessage,
      raw: responseData,
    };
  }

  async createVirtualAccount(config: VirtualAccountConfig): Promise<VirtualAccountResult> {
    // Step 1: Create the customer record
    const customerRes = await this.http.post(
      `${this.baseUrl}/customer`,
      {
        email: config.email,
        first_name: config.firstName,
        last_name: config.lastName,
        phone: config.phone,
      },
      this.headers()
    );
    const customerCode: string = customerRes.data.data.customer_code;

    // Step 2: Validate BVN (required before DVA creation with most banks)
    await this.http.post(
      `${this.baseUrl}/customer/${customerCode}/identification`,
      {
        country: 'NG',
        type: 'bvn',
        value: config.bvn,
        first_name: config.firstName,
        last_name: config.lastName,
      },
      this.headers()
    );

    // Step 3: Create the Dedicated Virtual Account
    const dvaRes = await this.http.post(
      `${this.baseUrl}/dedicated_account`,
      {
        customer: customerCode,
        preferred_bank: 'wema-bank', // Most widely supported; users can extend this
      },
      this.headers()
    );
    const dva = dvaRes.data.data;

    return {
      success: dvaRes.data.status === true,
      provider: 'paystack',
      accountNumber: dva.account_number,
      accountName: dva.account_name,
      bankName: dva.bank?.name || '',
      reference: String(dva.id || config.reference || generateReference('pvt_va')),
      expiresAt: null, // Paystack DVAs are permanent
      raw: dvaRes.data,
    };
  }
}
