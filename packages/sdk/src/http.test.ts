import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from './http';
import { AuthenticationError, ProviderError, NetworkError } from './errors';

// ── Helpers ──────────────────────────────────────────────────────

/** Create a mock fetch Response */
function mockResponse(status: number, body: any, ok?: boolean) {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    json: vi.fn().mockResolvedValue(body),
    headers: new Map([['content-type', 'application/json']]) as any,
  };
}

// ── Setup ────────────────────────────────────────────────────────

let client: HttpClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  // Disable retry by default to keep tests fast; specific tests re-enable it
  client = new HttpClient('test-provider', {
    retry: { enabled: false },
    timeout: 5000,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Successful Requests ──────────────────────────────────────────

describe('HttpClient - successful requests', () => {
  it('makes a GET request and returns parsed response', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

    const result = await client.get('https://api.test.com/resource');
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledOnce();

    // Verify it used GET method
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('GET');
  });

  it('makes a POST request with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 1 }));

    const result = await client.post(
      'https://api.test.com/resource',
      { name: 'test' },
      { 'X-Custom': 'header' }
    );

    expect(result.data).toEqual({ id: 1 });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ name: 'test' }));
    expect(options.headers['X-Custom']).toBe('header');
  });

  it('makes PUT and DELETE requests with correct methods', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, {}));

    await client.put('https://api.test.com/r', { x: 1 });
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');

    await client.delete('https://api.test.com/r');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });
});

// ── Error Handling ───────────────────────────────────────────────

describe('HttpClient - error handling', () => {
  it('throws AuthenticationError on 401 (no retry)', async () => {
    // Even with retry enabled, 401 should NOT retry
    client = new HttpClient('test-provider', {
      retry: { enabled: true, maxAttempts: 3, backoffMs: 1, retryableStatuses: [500] },
    });

    fetchMock.mockResolvedValueOnce(mockResponse(401, { message: 'Unauthorized' }, false));

    await expect(client.get('https://api.test.com/x'))
      .rejects.toThrow(AuthenticationError);

    // Should only have made 1 attempt (no retries for 401)
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws ProviderError on non-retryable error status', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(422, { message: 'Validation failed' }, false)
    );

    const error = await client.get('https://api.test.com/x').catch(e => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe('Validation failed');
  });

  it('throws NetworkError on fetch rejection', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(client.get('https://api.test.com/x'))
      .rejects.toThrow(NetworkError);
  });
});

// ── Retry Logic ──────────────────────────────────────────────────

describe('HttpClient - retry logic', () => {
  it('retries on retryable status codes', async () => {
    client = new HttpClient('test-provider', {
      retry: {
        enabled: true,
        maxAttempts: 3,
        backoffMs: 1, // 1ms to keep test fast
        retryableStatuses: [500, 502, 503],
      },
    });

    // First 2 calls return 500, third returns 200
    fetchMock
      .mockResolvedValueOnce(mockResponse(500, { error: 'server error' }, false))
      .mockResolvedValueOnce(mockResponse(500, { error: 'server error' }, false))
      .mockResolvedValueOnce(mockResponse(200, { data: 'recovered' }));

    const result = await client.get('https://api.test.com/x');
    expect(result.data).toEqual({ data: 'recovered' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws ProviderError after exhausting retries on 500', async () => {
    client = new HttpClient('test-provider', {
      retry: {
        enabled: true,
        maxAttempts: 2,
        backoffMs: 1,
        retryableStatuses: [500],
      },
    });

    fetchMock
      .mockResolvedValue(mockResponse(500, { error: 'down' }, false));

    const error = await client.get('https://api.test.com/x').catch(e => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.message).toContain('after 2 attempts');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on network errors, then throws NetworkError', async () => {
    client = new HttpClient('test-provider', {
      retry: {
        enabled: true,
        maxAttempts: 2,
        backoffMs: 1,
        retryableStatuses: [500],
      },
    });

    fetchMock.mockRejectedValue(new Error('network down'));

    const error = await client.get('https://api.test.com/x').catch(e => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on AbortError (timeout), then throws NetworkError', async () => {
    client = new HttpClient('test-provider', {
      retry: {
        enabled: true,
        maxAttempts: 2,
        backoffMs: 1,
        retryableStatuses: [500],
      },
    });

    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortError);

    const error = await client.get('https://api.test.com/x').catch(e => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).toContain('timed out');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('makes exactly 1 attempt when retry is disabled', async () => {
    // client already has retry disabled from beforeEach
    fetchMock.mockResolvedValueOnce(mockResponse(500, { error: 'down' }, false));

    const error = await client.get('https://api.test.com/x').catch(e => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
