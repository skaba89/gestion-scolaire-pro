"""Semester (LMD academic period) CRUD — module université build-out,
2026-09.

Semester is a distinct table from Term (see app/models/semester.py) rather
than a relabeling: the audit found Term already served double duty as
"trimestre"/"semestre" purely through frontend terminology
(useTerminology.ts), with no room for semester-specific behavior (credit-
gated progression) to diverge from the school trimestre's own rules.
Reuses terms:read/terms:write (already granted to TENANT_ADMIN/DIRECTOR in
ROLE_PERMISSIONS) rather than inventing a new permission for what is,
authorization-wise, the same kind of academic-structure object.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.semester import Semester  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

SEMESTERS_URL = "/api/v1/semesters/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class _AuthedClient:
    def __init__(self, headers: dict):
        self._headers = headers

    def get(self, url, **kwargs):
        return client.get(url, headers=self._headers, **kwargs)

    def post(self, url, **kwargs):
        return client.post(url, headers=self._headers, **kwargs)

    def put(self, url, **kwargs):
        return client.put(url, headers=self._headers, **kwargs)

    def delete(self, url, **kwargs):
        return client.delete(url, headers=self._headers, **kwargs)


def _as(user: dict) -> _AuthedClient:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return _AuthedClient({"Authorization": f"Bearer {token}"})


def _make_tenant_with_year():
    tenant_id = str(uuid.uuid4())
    year_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="Université Semestres Test", slug=f"sem-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
        ))
        db.flush()
        db.add(AcademicYear(
            id=year_id, tenant_id=tenant_id, name="2026-2027", code="2026-2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 31), is_current=True,
        ))
        db.commit()
    return {"tenant_id": tenant_id, "year_id": year_id}


def _make_semester(tenant_id: str, year_id: str, *, number: int = 1) -> str:
    semester_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Semester(
            id=semester_id, tenant_id=tenant_id, academic_year_id=year_id,
            name=f"Semestre {number}", number=number,
            start_date=date(2026, 9, 1), end_date=date(2027, 1, 31),
        ))
        db.commit()
    return semester_id


class TestSemesterCrud:
    def test_tenant_admin_can_create_semester(self):
        ctx = _make_tenant_with_year()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}).post(
            SEMESTERS_URL,
            json={
                "academic_year_id": ctx["year_id"], "name": "Semestre 1", "number": 1,
                "start_date": "2026-09-01", "end_date": "2027-01-31",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["number"] == 1

    def test_department_head_cannot_create_semester(self):
        """terms:write is not granted to DEPARTMENT_HEAD, same as for Term."""
        ctx = _make_tenant_with_year()
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DEPARTMENT_HEAD"], "tenant_id": ctx["tenant_id"]}).post(
            SEMESTERS_URL,
            json={
                "academic_year_id": ctx["year_id"], "name": "Semestre 1", "number": 1,
                "start_date": "2026-09-01", "end_date": "2027-01-31",
            },
        )
        assert resp.status_code == 403, resp.text

    def test_list_semesters(self):
        ctx = _make_tenant_with_year()
        _make_semester(ctx["tenant_id"], ctx["year_id"], number=1)
        _make_semester(ctx["tenant_id"], ctx["year_id"], number=2)
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}).get(
            SEMESTERS_URL,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 2

    def test_update_semester(self):
        ctx = _make_tenant_with_year()
        semester_id = _make_semester(ctx["tenant_id"], ctx["year_id"])
        resp = _as({"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": ctx["tenant_id"]}).put(
            f"{SEMESTERS_URL}{semester_id}/", json={"is_active": True},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_active"] is True

    def test_delete_semester(self):
        ctx = _make_tenant_with_year()
        semester_id = _make_semester(ctx["tenant_id"], ctx["year_id"])
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx["tenant_id"]}).delete(
            f"{SEMESTERS_URL}{semester_id}/",
        )
        assert resp.status_code == 204, resp.text

    def test_semester_is_tenant_scoped(self):
        ctx_a = _make_tenant_with_year()
        ctx_b = _make_tenant_with_year()
        semester_id = _make_semester(ctx_a["tenant_id"], ctx_a["year_id"])
        resp = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": ctx_b["tenant_id"]}).get(
            f"{SEMESTERS_URL}{semester_id}/",
        )
        assert resp.status_code == 404, resp.text
