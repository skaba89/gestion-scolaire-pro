"""Deux bugs signalés en direct par l'utilisateur (2026-08-25), via la
console du navigateur sur la production réelle :

1. GET /uploads/{tenant}/{file}.webp -> 401. TenantMiddleware n'exemptait
   les fichiers statiques que par extension (.ico/.png/.jpg/.jpeg/.svg/
   .css/.js — jamais .webp, ni aucun format futur), alors que les logos
   de tenant sont censés être publiquement accessibles (rendus sans
   authentification sur /annuaire et la landing page — voir
   resolveUploadUrl() côté frontend). Un <img src> n'envoie jamais
   d'Authorization header, donc toute image .webp tombait sur la
   branche 401 "Authentification requise" de TenantMiddleware.

2. GET /communication/messaging/poll/ -> 500 répétés. Le endpoint
   enveloppait resolve_current_tenant_id() (qui lève elle-même un 400
   légitime "Tenant introuvable" quand le tenant ne peut pas être
   résolu) dans un except Exception générique, masquant ce 400 en 500
   opaque. Rendu bien plus visible depuis que useRealtimeMessages() est
   monté sur les 6 portails (voir PR #115, feat(messaging)) au lieu du
   seul portail Parent — cet endpoint est maintenant appelé bien plus
   souvent, par bien plus d'identités.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from sqlalchemy import text  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _ensure_messaging_tables_sqlite(db) -> None:
    """conversations/conversation_participants/messages live in
    app/core/operational_tables.py (raw DDL, not an ORM model — see the
    module docstring), so Base.metadata.create_all() never creates them
    on the SQLite test DB (see tests/conftest.py). Minimal SQLite-safe
    subset of the real schema (no DEFAULT now()/gen_random_uuid(), never
    needed since tests always supply every column explicitly) — just
    enough for poll_new_messages()'s query to run without
    'no such table'."""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'DIRECT', title TEXT,
            created_at TEXT, updated_at TEXT
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS conversation_participants (
            id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
            user_id TEXT NOT NULL, last_read_at TEXT, created_at TEXT
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
            sender_id TEXT, content TEXT NOT NULL,
            tenant_id TEXT NOT NULL, created_at TEXT NOT NULL
        )
    """))
    db.commit()


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


class TestUploadsMiddlewareExemption:
    def test_webp_upload_is_not_blocked_by_auth_middleware(self):
        """Un fichier .webp inexistant doit 404 (StaticFiles), jamais 401
        (TenantMiddleware) — sans Authorization header, comme un vrai
        <img src>."""
        resp = client.get("/uploads/some-tenant/some-file.webp")
        assert resp.status_code == 404, (
            f"Attendu 404 (fichier absent) ; obtenu {resp.status_code} — "
            "le middleware bloque encore /uploads/*.webp avant même "
            "d'atteindre le serveur de fichiers statiques."
        )

    def test_any_extension_under_uploads_is_exempted_by_prefix(self):
        """Le correctif exempte tout /uploads/* par préfixe, pas seulement
        .webp — verrouille contre un futur format (.avif, .pdf, ...) qui
        retomberait dans le même piège qu'avant."""
        resp = client.get("/uploads/some-tenant/some-document.pdf")
        assert resp.status_code == 404
        assert resp.status_code != 401


class TestMessagingPollErrorHandling:
    def test_poll_surfaces_400_instead_of_masking_as_500(self):
        """Un utilisateur authentifié sans tenant_id résoluble ne doit
        jamais recevoir un 500 générique masquant la cause réelle — la
        requête est rejetée en 400 avant même d'atteindre le endpoint
        (TenantMiddleware, faute de tenant_id dans le JWT). Le endpoint
        lui-même a le même filet (except HTTPException: raise, voir
        communication.py::poll_new_messages) pour le cas où le JWT porte
        un tenant_id mais que resolve_current_tenant_id() le rejette
        pour une autre raison — les deux chemins doivent aboutir à un
        400, jamais un 500."""
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": None})
        resp = client.get(
            "/api/v1/communication/messaging/poll/",
            params={"since": "2026-08-25T00:00:00.000Z"},
            headers=headers,
        )
        assert resp.status_code == 400, resp.text

    def test_poll_succeeds_for_a_user_with_a_resolvable_tenant(self):
        """Non-régression : le chemin normal (tenant résoluble, aucun
        message) doit toujours renvoyer une liste vide en 200."""
        tenant_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École Poll Test", slug=f"poll-test-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            _ensure_messaging_tables_sqlite(db)
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TEACHER"], "tenant_id": tenant_id})
        resp = client.get(
            "/api/v1/communication/messaging/poll/",
            params={"since": "2026-08-25T00:00:00.000Z"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == []
