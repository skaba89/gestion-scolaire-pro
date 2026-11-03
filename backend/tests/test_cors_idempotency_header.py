"""Pré-vol CORS de X-Idempotency-Key (PR #345, parcours E2E 04).

L'en-tête était absent de `allow_headers` : un navigateur d'une autre
origine que l'API (application Capacitor, front servi à part — et le
parcours E2E « vraie stack », front :3000 / API :8000) refusait le pré-vol
et n'envoyait jamais l'encaissement ni les présences de la file hors-ligne
(`src/offline/outbox.ts`). En production web, front et API partagent
l'origine (`VITE_API_URL=/api`) : pas de pré-vol, pas d'effet visible.
"""
from conftest import get_test_client

client = get_test_client()

from app.main import origins  # noqa: E402

ORIGIN = origins[0]


def _preflight(path: str, headers: str):
    return client.options(
        path,
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": headers,
        },
    )


def test_idempotency_key_is_allowed_on_payment_preflight():
    resp = _preflight("/api/v1/payments/register/", "authorization,content-type,x-idempotency-key")
    assert resp.status_code == 200, resp.text
    assert resp.headers["access-control-allow-origin"] == ORIGIN
    assert "x-idempotency-key" in resp.headers["access-control-allow-headers"].lower()


def test_idempotency_key_is_allowed_on_offline_attendance_preflight():
    resp = _preflight("/api/v1/attendance/", "authorization,content-type,x-idempotency-key")
    assert resp.status_code == 200, resp.text


def test_unlisted_header_is_still_refused():
    """Garde-fou : l'ajout reste explicite, pas un `allow_headers=["*"]`."""
    resp = _preflight("/api/v1/payments/register/", "x-not-allowed-header")
    assert resp.status_code == 400
