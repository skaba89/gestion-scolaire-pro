import { describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { apiClient } from '../client';

/**
 * National audit Phase 6 (mobile-first / faible connexion) — the retry
 * interceptor previously only retried HTTP 502/503/504. On Guinea's
 * unstable mobile networks, requests far more often fail with NO response
 * at all (dropped connection, timeout) than with an explicit 5xx. This
 * proves the fix retries pure network failures for GET (safe, no side
 * effects), and — critically — proves it does NOT retry them for POST,
 * since a lost response after a mutation that actually succeeded server-side
 * (a payment, an enrollment) must never be silently replayed.
 */

// A real adapter (http/xhr) attaches `.config` to any error it throws —
// axios's own interceptor chain relies on `error.config` to find the
// original request to replay. A bare hand-thrown error from a custom
// adapter mock does NOT get this for free, so tests must set it explicitly
// to faithfully reproduce production behavior.
function networkError(config: any): AxiosError {
  const err = new AxiosError('Network Error');
  err.code = 'ERR_NETWORK';
  err.config = config;
  // No `response` set — this is what distinguishes a dropped connection
  // from an HTTP error response.
  return err;
}

describe('apiClient network-failure retry', () => {
  it('retries a GET request that failed with a pure network error', async () => {
    let callCount = 0;
    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      if (callCount === 1) {
        throw networkError(config);
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    });

    const resp = await apiClient.get('/health/live', { adapter });

    expect(callCount).toBe(2);
    expect(resp.data).toEqual({ ok: true });
  });

  it('does NOT retry a POST request that failed with a pure network error', async () => {
    let callCount = 0;
    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      throw networkError(config);
    });

    await expect(
      apiClient.post('/payments/register/', { amount: 1000 }, { adapter })
    ).rejects.toThrow();

    expect(callCount).toBe(1);
  });

  it('still retries on a transient 503 regardless of method (existing behavior preserved)', async () => {
    let callCount = 0;
    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      if (callCount === 1) {
        const err = new AxiosError('Service Unavailable');
        err.config = config;
        err.response = { status: 503, data: {}, statusText: '', headers: {}, config } as any;
        throw err;
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    });

    const resp = await apiClient.get('/health/ready', { adapter });

    expect(callCount).toBe(2);
    expect(resp.data).toEqual({ ok: true });
  });
});
