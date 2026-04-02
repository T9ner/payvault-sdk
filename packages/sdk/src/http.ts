import { NetworkError, ProviderError, AuthenticationError } from './errors';
import { sleep } from './utils';

export interface HttpResponse {
  status: number;
  data: any;
  headers: Record<string, string>;
}

export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;
  backoffMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY: RetryConfig = {
  enabled: true,
  maxAttempts: 3,
  backoffMs: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

export class HttpClient {
  private retryConfig: RetryConfig;
  private defaultTimeout: number;
  private providerName: string;

  constructor(providerName: string, options?: {
    retry?: Partial<RetryConfig>;
    timeout?: number;
  }) {
    this.providerName = providerName;
    this.retryConfig = { ...DEFAULT_RETRY, ...options?.retry };
    this.defaultTimeout = options?.timeout || 30000;
  }

  async request(config: HttpRequestConfig): Promise<HttpResponse> {
    const timeout = config.timeout || this.defaultTimeout;
    let lastError: Error | null = null;
    const maxAttempts = this.retryConfig.enabled ? this.retryConfig.maxAttempts : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchOptions: RequestInit = {
          method: config.method,
          headers: {
            'Content-Type': 'application/json',
            ...config.headers,
          },
          signal: controller.signal,
        };

        if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
          fetchOptions.body = JSON.stringify(config.body);
        }

        const response = await fetch(config.url, fetchOptions);
        clearTimeout(timeoutId);

        const data = await response.json().catch(() => null) as Record<string, any> | null;

        // Auth error -- don't retry
        if (response.status === 401) {
          throw new AuthenticationError(this.providerName, data);
        }

        // Retryable status
        if (this.retryConfig.retryableStatuses.includes(response.status)) {
          if (attempt < maxAttempts) {
            const backoff = this.retryConfig.backoffMs * Math.pow(2, attempt - 1);
            // Add jitter: +/- 25%
            const jitter = backoff * (0.75 + Math.random() * 0.5);
            await sleep(jitter);
            continue;
          }
          throw new ProviderError(
            `${this.providerName} returned ${response.status} after ${maxAttempts} attempts`,
            this.providerName,
            response.status,
            data
          );
        }

        // Non-retryable error
        if (!response.ok) {
          throw new ProviderError(
            data?.message || `Request failed with status ${response.status}`,
            this.providerName,
            response.status,
            data
          );
        }

        return {
          status: response.status,
          data,
          headers: Object.fromEntries(response.headers.entries()),
        };
      } catch (error: any) {
        // Re-throw our custom errors
        if (error instanceof AuthenticationError || error instanceof ProviderError) {
          throw error;
        }

        lastError = error;

        // Abort/timeout error
        if (error.name === 'AbortError') {
          if (attempt < maxAttempts) {
            const backoff = this.retryConfig.backoffMs * Math.pow(2, attempt - 1);
            await sleep(backoff);
            continue;
          }
          throw new NetworkError(this.providerName, new Error(`Request timed out after ${timeout}ms`));
        }

        // Network error -- retry
        if (attempt < maxAttempts) {
          const backoff = this.retryConfig.backoffMs * Math.pow(2, attempt - 1);
          await sleep(backoff);
          continue;
        }
      }
    }

    throw new NetworkError(this.providerName, lastError || undefined);
  }

  async get(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'GET', url, headers });
  }

  async post(url: string, body?: any, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'POST', url, headers, body });
  }

  async put(url: string, body?: any, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'PUT', url, headers, body });
  }

  async delete(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', url, headers });
  }
}
