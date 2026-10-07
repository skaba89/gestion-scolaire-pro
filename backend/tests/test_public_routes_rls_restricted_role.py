"""PostgreSQL integration tests: routes exempted from TenantMiddleware work
under the restricted runtime role (NOSUPERUSER NOBYPASSRLS).

Production incident (read-only audit, 2026-10-07): since the API switched to
the `schoolflow_api` runtime role (2026-10-05), every route that
TenantMiddleware exempts from the JWT-based tenant context (public pages,
public enrollment portal, kiosk scan, payment webhooks, onboarding, tenant
creation, super-admin stats) ran its queries with NO tenant context. Strict
RLS policies then hide every tenant row: e.g. GET /tenants/slug/{slug}/levels/
returned [] in production for a tenant that has 5 levels. Security failed
closed (nothing leaked), but the features were broken — and no test caught
it, because SQLite has no RLS and the CI PostgreSQL role is a superuser.

These tests run the REAL app (TestClient) with `app.core.database.SessionLocal`
swapped to a disposable, genuinely restricted role — same pattern as
test_auth_rls_restricted_role.py. Seeding goes through the admin (superuser)
engine. Each test also checks the tenant boundary: a route acting for tenant A
must never see or touch tenant B.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from conftest import get_test_client, redis_is_available

client = get_test_client()

import app.core.database as db_module  # noqa: E402
from app.core.database import engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)
_needs_redis = pytest.mark.skipif(not redis_is_available(), reason="Requires a real Redis instance")

DELIVER_PATH = "app.services.account_provisioning.deliver_password_setup_link"
RESTRICTED_ROLE = "test_public_routes_rls_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only
KIOSK_TOKEN = "kiosk-token-for-rls-tests-only"  # noqa: S105 — disposable test fixture


def _uid() -> str:
    return str(uuid.uuid4())


def _seed_tenant(conn, label: str) -> dict:
    """One tenant with 2 levels, a current academic year, a student, a kiosk
    device and a pending Mobile Money payment — inserted as the admin role."""
    t = {"id": _uid(), "slug": f"rls-{label}-{_uid()[:8]}"}
    conn.execute(text(
        "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
        "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
    ), {"id": t["id"], "name": f"École {label}", "slug": t["slug"]})
    for i, name in enumerate(("CP1", "CP2"), start=1):
        conn.execute(text(
            "INSERT INTO levels (id, tenant_id, name, order_index, created_at, updated_at) "
            "VALUES (:id, :tid, :name, :ix, now(), now())"
        ), {"id": _uid(), "tid": t["id"], "name": f"{name}-{label}", "ix": i})
    t["year_name"] = f"2026-2027-{label}"
    conn.execute(text(
        "INSERT INTO academic_years (id, tenant_id, name, code, start_date, end_date, is_current, created_at, updated_at) "
        "VALUES (:id, :tid, :name, :code, '2026-09-01', '2027-07-31', true, now(), now())"
    ), {"id": _uid(), "tid": t["id"], "name": t["year_name"], "code": f"Y-{label}"})
    t["student_id"], t["registration_number"] = _uid(), f"REG-{label}-{_uid()[:8]}"
    conn.execute(text(
        "INSERT INTO students (id, tenant_id, registration_number, first_name, last_name, date_of_birth, gender, "
        "created_at, updated_at) VALUES (:id, :tid, :reg, :fn, 'Test', '2015-01-01', 'MALE', now(), now())"
    ), {"id": t["student_id"], "tid": t["id"], "reg": t["registration_number"], "fn": f"Eleve{label}"})
    t["kiosk_token"] = f"{KIOSK_TOKEN}-{label}-{_uid()[:8]}"
    conn.execute(text(
        "INSERT INTO kiosk_devices (id, tenant_id, label, token_hash, is_active, created_at, updated_at) "
        "VALUES (:id, :tid, 'Entrée', :h, true, now(), now())"
    ), {"id": _uid(), "tid": t["id"], "h": hashlib.sha256(t["kiosk_token"].encode()).hexdigest()})
    t["payment_ref"] = f"PAY-RLS-{label}-{_uid()[:8]}"
    conn.execute(text(
        "INSERT INTO payments (id, tenant_id, student_id, amount, payment_date, payment_method, status, reference, "
        "created_at, updated_at) VALUES (:id, :tid, :sid, 1000, :d, 'MOBILE_MONEY', 'PENDING', :ref, now(), now())"
    ), {"id": _uid(), "tid": t["id"], "sid": t["student_id"], "d": date.today(), "ref": t["payment_ref"]})
    return t


def _seed_user(conn, tenant_id, role: str) -> str:
    user_id = _uid()
    email = f"{role.lower()}-{user_id[:8]}@rls-tests.local"
    conn.execute(text(
        "INSERT INTO users (id, email, username, tenant_id, password_hash, is_active, created_at, updated_at, "
        "mfa_enabled, must_change_password) VALUES (:id, :email, :email, :tid, 'x', true, now(), now(), false, false)"
    ), {"id": user_id, "email": email, "tid": tenant_id})
    conn.execute(text(
        "INSERT INTO user_roles (id, user_id, role, tenant_id, created_at, updated_at) "
        "VALUES (:id, :uid, :role, :tid, now(), now())"
    ), {"id": _uid(), "uid": user_id, "role": role, "tid": tenant_id})
    return user_id


def _auth(user_id: str, tenant_id, roles: list[str]) -> dict:
    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "roles": roles})
    return {"Authorization": f"Bearer {token}"}


def _admin_scalar(sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar()


@requires_postgres
class TestPublicRoutesUnderRestrictedRole:

    @pytest.fixture(scope="class", autouse=True)
    def _disable_auth_rate_limiter(self):
        """register-school shares the auth module's per-IP limiter with every
        other auth test of the full-suite run — same pattern as
        test_auth_rls_restricted_role.py."""
        from app.api.v1.endpoints.core.auth import limiter as auth_limiter
        previous = auth_limiter.enabled
        auth_limiter.enabled = False
        yield
        auth_limiter.enabled = previous

    @pytest.fixture(scope="class")
    def seeded(self):
        with engine.begin() as conn:
            a = _seed_tenant(conn, "A")
            b = _seed_tenant(conn, "B")
            a["admin_id"] = _seed_user(conn, a["id"], "TENANT_ADMIN")
            super_admin_id = _seed_user(conn, None, "SUPER_ADMIN")
        return {"A": a, "B": b, "super_admin_id": super_admin_id}

    @pytest.fixture(scope="class")
    def restricted_role(self):
        with engine.connect() as setup_conn:
            try:
                setup_conn.execute(text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
                setup_conn.execute(text(f'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
                setup_conn.commit()
            except Exception:
                setup_conn.rollback()
            setup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            setup_conn.execute(text(
                f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
                "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
            ))
            setup_conn.execute(text(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'))
            setup_conn.execute(text(f'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "{RESTRICTED_ROLE}"'))
            setup_conn.commit()
        yield RESTRICTED_ROLE
        with engine.connect() as cleanup_conn:
            cleanup_conn.execute(text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
            cleanup_conn.execute(text(f'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'))
            cleanup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
            cleanup_conn.commit()

    @pytest.fixture(autouse=True)
    def restricted_session_local(self, restricted_role, monkeypatch):
        url = make_url(engine.url.render_as_string(hide_password=False))
        restricted_url = url.set(username=RESTRICTED_ROLE, password=RESTRICTED_PASSWORD)
        restricted_engine = create_engine(restricted_url.render_as_string(hide_password=False), poolclass=StaticPool)
        with restricted_engine.connect() as conn:
            is_super, bypasses_rls = conn.execute(
                text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            ).one()
            assert not is_super and not bypasses_rls, "test setup bug: restricted role bypasses RLS"
        monkeypatch.setattr(
            db_module, "SessionLocal", sessionmaker(bind=restricted_engine, autocommit=False, autoflush=False)
        )
        from app.core.security import get_current_user as _gcu
        app.dependency_overrides.pop(_gcu, None)
        yield
        restricted_engine.dispose()

    # -- public tenant pages --------------------------------------------------

    def test_public_levels_by_slug(self, seeded):
        a = seeded["A"]
        resp = client.get(f"/api/v1/tenants/slug/{a['slug']}/levels/")
        assert resp.status_code == 200, resp.text
        names = [lvl["name"] for lvl in resp.json()]
        assert names == ["CP1-A", "CP2-A"], "tenant A's levels (and only A's) must be listed"

    def test_public_current_academic_year(self, seeded):
        a = seeded["A"]
        resp = client.get(f"/api/v1/tenants/slug/{a['slug']}/academic-years/current/")
        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == a["year_name"]

    def test_public_profile_stats_and_programs(self, seeded):
        a = seeded["A"]
        resp = client.get(f"/api/v1/tenants/slug/{a['slug']}/")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["stats"]["student_count"] == 1, "only tenant A's single student must be counted"
        assert body["slug"] == a["slug"]

    def test_admissions_public_tenant_info(self, seeded):
        a = seeded["A"]
        resp = client.get(f"/api/v1/admissions/public/tenant-info/{a['slug']}/")
        assert resp.status_code == 200, resp.text
        body = str(resp.json())
        assert "CP1-A" in body and a["year_name"] in body
        assert "CP1-B" not in body

    def test_admissions_public_apply_then_status(self, seeded):
        a = seeded["A"]
        email = f"parent-{_uid()[:8]}@rls-tests.local"
        resp = client.post("/api/v1/admissions/public/apply/", json={
            "tenant_id": a["id"], "student_first_name": "Awa", "student_last_name": "Camara",
            "parent_first_name": "Mariama", "parent_last_name": "Camara",
            "parent_email": email, "parent_phone": "+224600000000",
        })
        assert resp.status_code == 201, resp.text
        assert _admin_scalar(
            "SELECT count(*) FROM admission_applications WHERE tenant_id = :tid AND parent_email = :e",
            tid=a["id"], e=email,
        ) == 1
        status_resp = client.get("/api/v1/admissions/public/status/", params={"tenant_id": a["id"], "email": email})
        assert status_resp.status_code == 200, status_resp.text
        assert "Awa" in status_resp.text

    # -- kiosk ----------------------------------------------------------------

    def test_kiosk_scan_finds_own_tenant_student(self, seeded):
        a = seeded["A"]
        resp = client.post(
            "/api/v1/kiosk/scan/", headers={"X-Kiosk-Token": a["kiosk_token"]},
            json={"qr_payload": a["registration_number"], "direction": "IN"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["student_first_name"] == "EleveA"
        assert _admin_scalar(
            "SELECT count(*) FROM student_check_ins WHERE tenant_id = :tid AND student_id = :sid",
            tid=a["id"], sid=a["student_id"],
        ) >= 1

    def test_kiosk_scan_never_reaches_another_tenant(self, seeded):
        a, b = seeded["A"], seeded["B"]
        resp = client.post(
            "/api/v1/kiosk/scan/", headers={"X-Kiosk-Token": a["kiosk_token"]},
            json={"qr_payload": b["registration_number"], "direction": "IN"},
        )
        assert resp.status_code == 404, "tenant A's kiosk must not find tenant B's student"

    # -- payment webhooks -----------------------------------------------------

    @pytest.mark.parametrize("gateway,url,field", [
        ("cinetpay", "/api/v1/parents/payments/webhook/cinetpay/", "cpm_trans_id"),
        ("paytech", "/api/v1/parents/payments/webhook/paytech/", "ref_command"),
    ])
    def test_payment_webhook_resolves_payment_tenant(self, seeded, gateway, url, field):
        a = seeded["A"]
        resp = client.post(url, json={field: a["payment_ref"]})
        assert resp.status_code == 200, resp.text
        logged_tenant, reason = None, None
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT tenant_id::text, reason FROM payment_webhook_events "
                "WHERE gateway = :g AND transaction_id = :ref ORDER BY created_at DESC LIMIT 1"
            ), {"g": gateway, "ref": a["payment_ref"]}).first()
            if row:
                logged_tenant, reason = row
        assert reason != "no matching payment reference", "the webhook must find the payment under RLS"
        assert logged_tenant == a["id"]

    # -- authenticated but middleware-exempt routes ---------------------------

    @_needs_redis
    def test_onboarding_levels_replaces_only_own_tenant_levels(self, seeded):
        a, b = seeded["A"], seeded["B"]
        resp = client.post(
            "/api/v1/tenants/onboarding/levels/", json=["Niv1", "Niv2", "Niv3"],
            headers=_auth(a["admin_id"], a["id"], ["TENANT_ADMIN"]),
        )
        assert resp.status_code == 200, resp.text
        assert _admin_scalar("SELECT count(*) FROM levels WHERE tenant_id = :t", t=a["id"]) == 3
        assert _admin_scalar("SELECT count(*) FROM levels WHERE tenant_id = :t", t=b["id"]) == 2

    @_needs_redis
    def test_super_admin_stats_count_every_tenant(self, seeded):
        resp = client.get(
            "/api/v1/tenants/super-admin/stats/",
            headers=_auth(seeded["super_admin_id"], None, ["SUPER_ADMIN"]),
        )
        assert resp.status_code == 200, resp.text
        by_id = {t["id"]: t for t in resp.json()}
        assert by_id[seeded["A"]["id"]]["student_count"] == 1
        assert by_id[seeded["B"]["id"]]["student_count"] == 1
        assert by_id[seeded["A"]["id"]]["admin_count"] == 1

    @_needs_redis
    def test_super_admin_creates_tenant_with_admin(self, seeded):
        from app.services.account_provisioning import PasswordSetupDelivery

        slug = f"rls-new-{_uid()[:8]}"
        admin_email = f"new-admin-{_uid()[:8]}@rls-tests.local"
        with patch(DELIVER_PATH, new=AsyncMock(return_value=PasswordSetupDelivery("token", 86400))):
            resp = client.post(
                "/api/v1/tenants/create-with-admin/",
                headers=_auth(seeded["super_admin_id"], None, ["SUPER_ADMIN"]),
                json={"name": "École Nouvelle", "slug": slug, "type": "primary", "levels": ["CP1"],
                      "admin_email": admin_email, "admin_first_name": "Fatou", "admin_last_name": "Bah"},
            )
        assert resp.status_code == 201, resp.text
        new_id = resp.json()["id"]
        assert _admin_scalar("SELECT count(*) FROM users WHERE email = :e AND tenant_id = :t", e=admin_email, t=new_id) == 1
        assert _admin_scalar(
            "SELECT count(*) FROM user_roles WHERE tenant_id = :t AND role = 'TENANT_ADMIN'", t=new_id
        ) == 1

    @_needs_redis
    def test_create_with_admin_rejects_email_used_in_another_tenant(self, seeded):
        a = seeded["A"]
        existing_email = _admin_scalar("SELECT email FROM users WHERE id = :u", u=a["admin_id"])
        resp = client.post(
            "/api/v1/tenants/create-with-admin/",
            headers=_auth(seeded["super_admin_id"], None, ["SUPER_ADMIN"]),
            json={"name": "Doublon", "slug": f"rls-dup-{_uid()[:8]}", "type": "primary",
                  "admin_email": existing_email, "admin_first_name": "X", "admin_last_name": "Y"},
        )
        assert resp.status_code == 400, f"duplicate email across tenants must be a clean 400, got {resp.status_code}: {resp.text}"

    # -- public self-registration ---------------------------------------------

    def test_register_school_creates_tenant_and_admin(self):
        email = f"founder-{_uid()[:8]}@academy-guinee-tests.gn"  # EmailStr rejects reserved TLDs (.local)
        slug = f"rls-self-{_uid()[:8]}"
        resp = client.post("/api/v1/auth/register-school/", json={
            "school_name": "École Libre-Service", "school_type": "primary", "country": "GN",
            "first_name": "Ibrahima", "last_name": "Sow", "email": email,
            "password": "Sup3r@Secure-Pw-2026!", "slug": slug,
        })
        assert resp.status_code == 201, resp.text
        tenant_id = _admin_scalar("SELECT id::text FROM tenants WHERE slug = :s", s=slug)
        assert tenant_id, "the tenant must be created"
        assert _admin_scalar("SELECT count(*) FROM users WHERE email = :e AND tenant_id = :t", e=email, t=tenant_id) == 1
        assert _admin_scalar(
            "SELECT count(*) FROM user_roles WHERE tenant_id = :t AND role = 'TENANT_ADMIN'", t=tenant_id
        ) == 1
