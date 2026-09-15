"""GET /platform/security/database-role/ (institutional-readiness audit,
2026-09) — docs/SECURITY_MODEL.md P1.

Row-Level Security is enabled on tenant tables, but PostgreSQL grants
BYPASSRLS implicitly to any superuser role regardless of ENABLE/FORCE RLS.
This endpoint lets a SUPER_ADMIN verify, on any real deployment, whether the
application's own connection role actually gets RLS enforcement or silently
bypasses it — without needing direct database access. SUPER_ADMIN only,
never returns secrets (only a role name and two booleans).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
SUPER_ADMIN = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
TENANT_ADMIN = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": str(uuid.uuid4())}
DIRECTOR = {"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": str(uuid.uuid4())}


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestAccessControl:
    def test_requires_auth(self):
        resp = client.get("/api/v1/platform/security/database-role/")
        assert resp.status_code == 401

    def test_tenant_admin_forbidden(self):
        headers = _as(TENANT_ADMIN)
        resp = client.get("/api/v1/platform/security/database-role/", headers=headers)
        assert resp.status_code == 403

    def test_director_forbidden(self):
        headers = _as(DIRECTOR)
        resp = client.get("/api/v1/platform/security/database-role/", headers=headers)
        assert resp.status_code == 403


@pytest.mark.skipif(
    engine.dialect.name == "postgresql",
    reason="This assertion is specific to the SQLite test database used by default.",
)
class TestSqliteIsGracefullyNotApplicable:
    def test_reports_not_applicable_instead_of_erroring(self):
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/security/database-role/", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["applicable"] is False
        assert "SQLite" in body["detail"]


@pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="pg_roles only exists on PostgreSQL — exercised in the CI Postgres job.",
)
class TestPostgresReturnsRealRoleFacts:
    def test_response_shape_and_internal_consistency(self):
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/security/database-role/", headers=headers)
        assert resp.status_code == 200
        body = resp.json()

        assert body["applicable"] is True
        assert body["checked"] is True
        assert isinstance(body["role_name"], str) and body["role_name"]
        assert isinstance(body["is_superuser"], bool)
        assert isinstance(body["bypasses_rls"], bool)
        # rls_effective must always be the exact negation of the two flags —
        # this is the fact a SUPER_ADMIN actually needs to trust before a
        # real deployment, so it must never drift from the raw pg_roles read.
        assert body["rls_effective"] == (not body["is_superuser"] and not body["bypasses_rls"])

    def test_never_leaks_a_database_connection_string_or_password(self):
        headers = _as(SUPER_ADMIN)
        resp = client.get("/api/v1/platform/security/database-role/", headers=headers)
        body_text = resp.text
        assert "postgresql://" not in body_text
        assert "DATABASE_URL" not in body_text
