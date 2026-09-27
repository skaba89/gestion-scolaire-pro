"""National-scale production-readiness audit: RLS coverage on child tables
without their own tenant_id column.

Every previous RLS sweep (659b47b029bd, c4d5e6f7a8b9, b5e71cce8a7a)
discovers tables via `EXISTS (... attname = 'tenant_id')` — exactly right
for tables that carry their own tenant_id, but structurally blind to a
child table that has none. Five such tables had RLS entirely disabled:
alumni_request_history, conversation_participants, email_otps,
order_items, user_message_status. Migration 20260927_0001 scopes each to
its tenant-owning parent via its own FK column.

Testing this meaningfully requires a genuinely restricted PostgreSQL role
(NOSUPERUSER, NOBYPASSRLS): PostgreSQL grants BYPASSRLS implicitly to any
superuser regardless of ENABLE/FORCE ROW LEVEL SECURITY (see
docs/INSTITUTIONAL_ROLES.md and GET /platform/security/database-role/) —
the app's own configured connection in this test suite is such a
superuser (true both in CI's postgres:16 service, whose POSTGRES_USER is
always created as a superuser by the official image, and in local
dev/docker-compose), so testing through it would prove nothing about
whether the *policy itself* is correct. This module creates its own
disposable, properly-restricted role and connects to it directly with a
raw driver connection instead.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import engine  # noqa: E402
from app.core.operational_tables import ensure_operational_tables  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)

if engine.dialect.name == "postgresql":
    ensure_operational_tables(engine)

RESTRICTED_ROLE = "test_rls_restricted_role"
RESTRICTED_PASSWORD = "test-only-restricted-role-password"  # noqa: S105 — disposable, local test DB only


@pytest.fixture(scope="module")
def restricted_connection():
    """A raw psycopg connection authenticated as a disposable NOSUPERUSER,
    NOBYPASSRLS role — the only way to actually exercise these RLS
    policies rather than bypass them."""
    import psycopg

    with engine.connect() as setup_conn:
        # A role holding table privileges cannot be dropped until they're
        # revoked — belt-and-braces here (in addition to the teardown's own
        # revoke+drop) so a prior interrupted run never blocks this one.
        # REVOKE errors if the role doesn't exist yet (first-ever run) —
        # harmless, there's nothing to revoke in that case.
        try:
            setup_conn.execute(text(
                f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'
            ))
            setup_conn.commit()
        except Exception:
            setup_conn.rollback()
        setup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        setup_conn.execute(text(
            f'CREATE ROLE "{RESTRICTED_ROLE}" LOGIN PASSWORD \'{RESTRICTED_PASSWORD}\' '
            "NOSUPERUSER NOBYPASSRLS"
        ))
        setup_conn.execute(text(
            f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{RESTRICTED_ROLE}"'
        ))
        setup_conn.commit()

    url = make_url(str(engine.url))
    conn = psycopg.connect(
        host=url.host,
        port=url.port or 5432,
        dbname=url.database,
        user=RESTRICTED_ROLE,
        password=RESTRICTED_PASSWORD,
    )
    conn.autocommit = True

    # Confirm the role really is unprivileged before trusting any test
    # result below — a false negative here would silently make every
    # assertion in this module meaningless.
    with conn.cursor() as cur:
        cur.execute(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = %s",
            (RESTRICTED_ROLE,),
        )
        is_super, bypasses_rls = cur.fetchone()
        assert not is_super, "test setup bug: restricted role is a superuser"
        assert not bypasses_rls, "test setup bug: restricted role has BYPASSRLS"

    yield conn

    conn.close()
    with engine.connect() as cleanup_conn:
        cleanup_conn.execute(text(
            f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{RESTRICTED_ROLE}"'
        ))
        cleanup_conn.execute(text(f'DROP ROLE IF EXISTS "{RESTRICTED_ROLE}"'))
        cleanup_conn.commit()


def _set_tenant(conn, tenant_id: str | None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT set_config('app.current_tenant_id', %s, false)",
            (tenant_id,),
        )


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
        ), {"id": tenant_id, "name": name, "slug": f"rls-child-{tenant_id[:8]}"})
        conn.commit()
    return tenant_id


def _make_user(tenant_id: str) -> str:
    user_id = str(uuid.uuid4())
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO users (id, tenant_id, email, username, first_name, last_name, "
            "password_hash, is_active, created_at, updated_at) "
            "VALUES (:id, :tid, :email, :username, 'Test', 'User', 'x', true, now(), now())"
        ), {
            "id": user_id, "tid": tenant_id,
            "email": f"{user_id[:8]}@rls-child-test.example", "username": f"u-{user_id[:8]}",
        })
        conn.commit()
    return user_id


def _make_conversation(tenant_id: str) -> str:
    conversation_id = str(uuid.uuid4())
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO conversations (id, tenant_id, created_at, updated_at) "
            "VALUES (:id, :tid, now(), now())"
        ), {"id": conversation_id, "tid": tenant_id})
        conn.commit()
    return conversation_id


def _make_conversation_participant(conversation_id: str, user_id: str) -> str:
    row_id = str(uuid.uuid4())
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO conversation_participants (id, conversation_id, user_id, created_at) "
            "VALUES (:id, :cid, :uid, now())"
        ), {"id": row_id, "cid": conversation_id, "uid": user_id})
        conn.commit()
    return row_id


def _make_email_otp(user_id: str) -> str:
    row_id = str(uuid.uuid4())
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO email_otps (id, user_id, code_hash, expires_at, is_valid, created_at) "
            "VALUES (:id, :uid, 'hash', now() + interval '1 hour', true, now())"
        ), {"id": row_id, "uid": user_id})
        conn.commit()
    return row_id


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    from app.core.security import get_current_user
    from app.main import app
    app.dependency_overrides.pop(get_current_user, None)


@requires_postgres
class TestConversationParticipantsRlsCoverage:
    def test_restricted_role_only_sees_own_tenants_participants(self, restricted_connection):
        tenant_a = _make_tenant("École RLS Child A")
        tenant_b = _make_tenant("École RLS Child B")
        user_a = _make_user(tenant_a)
        user_b = _make_user(tenant_b)
        conv_a = _make_conversation(tenant_a)
        conv_b = _make_conversation(tenant_b)
        _make_conversation_participant(conv_a, user_a)
        _make_conversation_participant(conv_b, user_b)

        _set_tenant(restricted_connection, tenant_a)
        with restricted_connection.cursor() as cur:
            cur.execute("SELECT conversation_id FROM conversation_participants")
            visible = {str(row[0]) for row in cur.fetchall()}

        assert conv_a in visible
        assert conv_b not in visible

    def test_restricted_role_cannot_insert_participant_for_another_tenants_conversation(
        self, restricted_connection,
    ):
        tenant_a = _make_tenant("École RLS Child C")
        tenant_b = _make_tenant("École RLS Child D")
        user_a = _make_user(tenant_a)
        conv_b = _make_conversation(tenant_b)

        _set_tenant(restricted_connection, tenant_a)
        with pytest.raises(Exception):  # psycopg raises on RLS WITH CHECK violation
            with restricted_connection.cursor() as cur:
                cur.execute(
                    "INSERT INTO conversation_participants (id, conversation_id, user_id, created_at) "
                    "VALUES (%s, %s, %s, now())",
                    (str(uuid.uuid4()), conv_b, user_a),
                )


@requires_postgres
class TestEmailOtpsRlsCoverage:
    def test_restricted_role_only_sees_own_tenants_otps(self, restricted_connection):
        tenant_a = _make_tenant("École RLS Child E")
        tenant_b = _make_tenant("École RLS Child F")
        user_a = _make_user(tenant_a)
        user_b = _make_user(tenant_b)
        otp_a = _make_email_otp(user_a)
        otp_b = _make_email_otp(user_b)

        _set_tenant(restricted_connection, tenant_a)
        with restricted_connection.cursor() as cur:
            cur.execute("SELECT id::text FROM email_otps")
            visible = {row[0] for row in cur.fetchall()}

        assert otp_a in visible
        assert otp_b not in visible


@requires_postgres
class TestNoTenantContextSeesNothing:
    """Matches the behavior of every other tenant-scoped table's RLS policy
    in this codebase: with no app.current_tenant_id set, the restricted
    role sees no rows at all (never an accidental "no filter = everything"
    fallback)."""

    def test_no_tenant_context_hides_all_rows(self, restricted_connection):
        tenant_a = _make_tenant("École RLS Child G")
        user_a = _make_user(tenant_a)
        conv_a = _make_conversation(tenant_a)
        _make_conversation_participant(conv_a, user_a)

        _set_tenant(restricted_connection, None)
        with restricted_connection.cursor() as cur:
            cur.execute("SELECT count(*) FROM conversation_participants")
            (count,) = cur.fetchone()

        assert count == 0
