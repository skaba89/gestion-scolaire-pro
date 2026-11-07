"""Regression: SQLite user listing and detail return complete role names.

Exercise the actual SQL in an isolated in-memory SQLite database rather
than mocking it: GROUP_CONCAT(DISTINCT x, ',') is invalid on SQLite.
"""
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from fastapi import HTTPException
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.v1.endpoints.core import users


def _request():
    return Request({
        "type": "http", "method": "GET", "path": "/users/",
        "root_path": "", "scheme": "http", "query_string": b"",
        "headers": [], "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


@pytest.fixture
def sqlite_users_db():
    engine = create_engine("sqlite:///:memory:")
    tenant = str(uuid4())
    other_tenant = str(uuid4())
    user_id = str(uuid4())
    foreign_id = str(uuid4())
    with engine.begin() as conn:
        conn.exec_driver_sql("""
            CREATE TABLE users (
                id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT,
                first_name TEXT, last_name TEXT, is_active BOOLEAN,
                avatar_url TEXT, created_at TEXT
            )
        """)
        conn.exec_driver_sql("""
            CREATE TABLE user_roles (
                user_id TEXT, tenant_id TEXT, role TEXT
            )
        """)
        conn.exec_driver_sql(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, tenant, "teacher@school.gn", "A", "Diallo", 1, None, None),
        )
        conn.exec_driver_sql(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (foreign_id, other_tenant, "foreign@school.gn", "B", "Sow", 1, None, None),
        )
        for role in ("TEACHER", "TENANT_ADMIN", "TEACHER"):
            conn.exec_driver_sql(
                "INSERT INTO user_roles VALUES (?, ?, ?)", (user_id, tenant, role),
            )
        conn.exec_driver_sql(
            "INSERT INTO user_roles VALUES (?, ?, ?)",
            (foreign_id, other_tenant, "STUDENT"),
        )
    try:
        with Session(engine) as db:
            yield db, tenant, user_id, foreign_id
    finally:
        engine.dispose()


def test_list_users_sqlite_distinct_roles_and_tenant_boundary(sqlite_users_db):
    db, tenant, user_id, _foreign = sqlite_users_db
    with patch.object(users, "settings", SimpleNamespace(is_sqlite=True)), patch(
        "app.core.tenant_resolution.resolve_current_tenant_id", return_value=tenant,
    ):
        response = users.list_users(
            request=_request(), db=db,
            current_user={"tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
            page=1, page_size=20, search=None, role=None, is_active=None,
        )
    assert response["total"] == 1
    assert len(response["items"]) == 1
    assert response["items"][0]["id"] == user_id
    assert set(response["items"][0]["roles"]) == {"TEACHER", "TENANT_ADMIN"}
    assert len(response["items"][0]["roles"]) == 2


def test_get_user_sqlite_distinct_roles_and_tenant_boundary(sqlite_users_db):
    db, tenant, user_id, foreign_id = sqlite_users_db
    with patch.object(users, "settings", SimpleNamespace(is_sqlite=True)), patch(
        "app.core.tenant_resolution.resolve_current_tenant_id", return_value=tenant,
    ):
        result = users.get_user(
            user_id=user_id, request=_request(), db=db,
            current_user={"tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
        )
        assert set(result["roles"]) == {"TEACHER", "TENANT_ADMIN"}
        assert len(result["roles"]) == 2
        with pytest.raises(HTTPException) as exc:
            users.get_user(
                user_id=foreign_id, request=_request(), db=db,
                current_user={"tenant_id": tenant, "roles": ["TENANT_ADMIN"]},
            )
    assert exc.value.status_code == 404
