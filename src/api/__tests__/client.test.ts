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

/**
 * Fine points follow-up (2026-08-08) — Render's free tier sleeps the
 * backend after inactivity; the first request after a nap can 503 for
 * 20-50s while the container restarts. The generic 502/503/504 retry above
 * only budgets ~1.5s total (2 retries at 500ms/1000ms), nowhere near
 * enough — a real user's first login attempt after a nap would fail with
 * a raw error instead of quietly waiting for the wake-up. /auth/login/
 * gets a much longer, dedicated retry budget since a failed login never
 * has a server-side side effect to duplicate, unlike a generic mutation.
 */
describe('apiClient cold-start retry (POST /auth/login/)', () => {
  function serverUnavailable(config: any, status = 503): AxiosError {
    const err = new AxiosError('Service Unavailable');
    err.config = config;
    err.response = { status, data: {}, statusText: '', headers: {}, config } as any;
    return err;
  }

  it('retries past the generic 2-attempt budget and emits schoolflow:cold-start-retry', async () => {
    let callCount = 0;
    const events: Array<{ attempt: number; maxAttempts: number }> = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('schoolflow:cold-start-retry', listener);

    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      // Fails 3 times — past the generic MAX_AUTO_RETRIES=2 — to prove the
      // cold-start path (not the generic one) is what's carrying this.
      if (callCount <= 3) throw serverUnavailable(config);
      return { data: { access_token: 'tok' }, status: 200, statusText: 'OK', headers: {}, config };
    });

    try {
      const resp = await apiClient.post('/auth/login/', {}, { adapter });
      expect(callCount).toBe(4);
      expect(resp.data).toEqual({ access_token: 'tok' });
      expect(events.length).toBe(3);
      expect(events.map((e) => e.attempt)).toEqual([1, 2, 3]);
      expect(events[0].maxAttempts).toBe(6);
    } finally {
      window.removeEventListener('schoolflow:cold-start-retry', listener);
    }
  }, 15_000);

  it('does NOT extend the same long budget to an unrelated POST (regression guard)', async () => {
    let callCount = 0;
    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      throw serverUnavailable(config);
    });

    // /payments/register/ is a real mutation — must still be bounded by the
    // generic 2-retry budget, not silently upgraded to 6 long retries just
    // because it also happens to see a 503.
    await expect(
      apiClient.post('/payments/register/', { amount: 1000 }, { adapter })
    ).rejects.toThrow();

    expect(callCount).toBe(3); // 1 initial + 2 generic retries, not 7
  }, 10_000);
});

/**
 * Suite du même incident prod que le test "erreur non-JSON" plus haut —
 * Render's edge throttle le réveil d'un service en veille avec un 429
 * portant l'en-tête x-render-routing: hibernate-rate-limited, AVANT même
 * d'atteindre notre app. Contrairement à un 5xx générique ou une réponse
 * perdue, ce signal précis garantit que la requête n'a jamais atteint le
 * serveur — donc la rejouer est toujours sûr, même pour un POST.
 */
describe('apiClient cold-start retry — Render hibernate-rate-limited (any method/path)', () => {
  function hibernateThrottled(config: any): AxiosError {
    const err = new AxiosError('Too Many Requests');
    err.config = config;
    err.response = {
      status: 429,
      data: 'Too Many Requests\n',
      statusText: 'Too Many Requests',
      headers: { 'x-render-routing': 'hibernate-rate-limited' },
      config,
    } as any;
    return err;
  }

  it('retries a GET unrelated to /auth/login/ (e.g. the annuaire) past the generic budget', async () => {
    let callCount = 0;
    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      if (callCount <= 3) throw hibernateThrottled(config);
      return { data: [], status: 200, statusText: 'OK', headers: {}, config };
    });

    const resp = await apiClient.get('/tenants/public/', { adapter });
    expect(callCount).toBe(4);
    expect(resp.data).toEqual([]);
  }, 15_000);

  it('retries a POST too — the request never reached the app, so no side effect to duplicate', async () => {
    let callCount = 0;
    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      if (callCount <= 3) throw hibernateThrottled(config);
      return { data: { ok: true }, status: 201, statusText: 'Created', headers: {}, config };
    });

    const resp = await apiClient.post('/payments/register/', { amount: 1000 }, { adapter });
    expect(callCount).toBe(4);
    expect(resp.data).toEqual({ ok: true });
  }, 15_000);

  it('does NOT extend the long budget to a plain 429 without the Render header (regression guard)', async () => {
    // e.g. the app's own login rate-limiter (5/minute) — a real "you're
    // going too fast" from our backend, not Render's edge blocking a
    // wake-up attempt. Must stay bounded by the generic 2-retry budget.
    let callCount = 0;
    const adapter = vi.fn(async (config: any) => {
      callCount += 1;
      const err = new AxiosError('Too Many Requests');
      err.config = config;
      err.response = { status: 429, data: {}, statusText: '', headers: {}, config } as any;
      throw err;
    });

    await expect(
      apiClient.get('/tenants/public/', { adapter })
    ).rejects.toThrow();

    expect(callCount).toBe(1); // 429 isn't even in the generic retry list
  }, 10_000);
});

/**
 * Prod incident (2026-08-25) — a 429 from Render's edge layer (hibernating
 * free-tier service throttling wake attempts, before the request ever
 * reaches the FastAPI app) comes back as a plain-text body
 * ("Too Many Requests"), not our usual JSON `{detail: ...}` shape. axios
 * exposes that as `error.response.data` being a bare string. The detail-
 * normalization interceptor used to assign `.detail` onto it
 * unconditionally — writing a property onto a string primitive throws
 * `TypeError: Cannot create property 'detail' on string ...` in strict
 * mode, which replaced the real 429 with a confusing crash on every
 * login attempt (observed on both iPhone and PC simultaneously, from the
 * user's own screenshot).
 */
describe('apiClient error interceptor — non-JSON error body', () => {
  it('does not throw when the error response body is a plain string (e.g. edge-layer 429)', async () => {
    const adapter = vi.fn(async (config: any) => {
      const err = new AxiosError('Request failed with status code 429');
      err.config = config;
      err.response = {
        status: 429,
        data: 'Too Many Requests\n',
        statusText: 'Too Many Requests',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        config,
      } as any;
      throw err;
    });

    const rejection = apiClient.get('/tenants/public/', { adapter });
    await expect(rejection).rejects.toThrow();

    // The promise must reject with the *original* 429, not a TypeError
    // from the interceptor itself crashing on the string body.
    try {
      await rejection;
    } catch (err: any) {
      expect(err.response?.status).toBe(429);
      expect(err.response?.data).toBe('Too Many Requests\n');
    }
  });
});
