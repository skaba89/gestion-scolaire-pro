"""SQLite integration checks for user role assignments and profiles.

Use real SQLite to catch PostgreSQL-only SQL syntax and preserve tenant scope.
"""
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/users/profiles/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


def test_role_assignments_and_profiles_use_sqlite_and_tenant_scope():
    engine = create_engine("sqlite:///:memory:")
    tenant, other_tenant = str(uuid4()), str(uuid4())
    own_user, other_user = str(uuid4()), str(uuid4())
    with engine.begin() as conn:
        conn.exec_driver_sql("""
            CREATE TABLE users (
                id TEXT PRIMARY KEY, tenant_id TEXT, first_name TEXT,
                last_name TEXT, email TEXT, is_active BOOLEAN, created_at TEXT
            )
        """)
        conn.exec_driver_sql("""
            CREATE TABLE user_roles (
                user_id TEXT, tenant_id TEXT, role TEXT, created_at TEXT
            )
        """)
        conn.exec_driver_sql("""
            CREATE TABLE profiles (id TEXT PRIMARY KEY, avatar_url TEXT, phone TEXT)
        """)
        conn.exec_driver_sql(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)",
            (own_user, tenant, "A", "Diallo", "a@example.gn", 1, None),
        )
        conn.exec_driver_sql(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)",
            (other_user, other_tenant, "B", "Sow", "b@example.gn", 1, None),
        )
        conn.exec_driver_sql(
            "INSERT INTO profiles VALUES (?, ?, ?)",
            (own_user, None, "+2240000"),
        )
        for role in ("TEACHER", "TENANT_ADMIN", "TEACHER"):
            conn.exec_driver_sql(
                "INSERT INTO user_roles VALUES (?, ?, ?, ?)",
                (own_user, tenant, role, None),
            )
        conn.exec_driver_sql(
            "INSERT INTO user_roles VALUES (?, ?, ?, ?)",
            (other_user, other_tenant, "STUDENT", None),
        )

    try:
        with Session(engine) as db, patch.object(
            users, "settings", SimpleNamespace(is_sqlite=True),
        ), patch(
            "app.core.tenant_resolution.resolve_current_tenant_id",
            return_value=tenant,
        ):
            user = {"tenant_id": tenant, "roles": ["TENANT_ADMIN"]}
            roles = users.list_user_roles(
                request=_request(), tenant_id=other_tenant,
                db=db, current_user=user,
            )
            assert len(roles) == 3
            assert {r["role"] for r in roles} == {"TEACHER", "TENANT_ADMIN"}
            assert {r["user_id"] for r in roles} == {own_user}
            assert all(r["id"] == f'{own_user}:{r["role"]}' for r in roles)

            profiles = users.list_user_profiles(
                request=_request(), tenant_id=other_tenant, search=None,
                db=db, current_user=user,
            )
            assert len(profiles) == 1
            assert profiles[0]["id"] == own_user
            assert profiles[0]["phone"] == "+2240000"
            assert set(profiles[0]["roles"]) == {"TEACHER", "TENANT_ADMIN"}
            assert len(profiles[0]["roles"]) == 2
    finally:
        engine.dispose()
