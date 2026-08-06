"""PATCH/DELETE /infrastructure/programs/{id}/ — regression test.

Before this, the endpoint only ever exposed GET/POST: a tenant seeded with
generic placeholder programs ("Licence 1", "Master 1", ...) had no way,
neither via the admin UI (which didn't exist either) nor the API, to rename
or remove them to replace with their real named filières.
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.program import Program  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}
URL = "/api/v1/infrastructure/programs/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    return HEADERS


def _make_tenant_and_program(name: str = "Licence 1") -> tuple[str, str]:
    tenant_id = str(uuid.uuid4())
    program_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Filières Test", slug=f"prog-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
        db.add(Program(id=program_id, tenant_id=tenant_id, name=name, code=None, description=None))
        db.commit()
    return tenant_id, program_id


class TestUpdateProgram:
    def test_renames_placeholder_program(self):
        tenant_id, program_id = _make_tenant_and_program("Licence 1")
        headers = _as(tenant_id)

        resp = client.patch(
            f"{URL}{program_id}/",
            json={"name": "Économie", "code": "ECO", "description": "Licence en économie"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "Économie"
        assert body["code"] == "ECO"

        with SessionLocal() as db:
            row = db.query(Program).filter(Program.id == program_id).first()
            assert row.name == "Économie"

    def test_partial_update_leaves_other_fields_untouched(self):
        tenant_id, program_id = _make_tenant_and_program("Master 1")
        headers = _as(tenant_id)

        resp = client.patch(f"{URL}{program_id}/", json={"code": "M1-SANTE"}, headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Master 1"
        assert resp.json()["code"] == "M1-SANTE"

    def test_404_for_unknown_program(self):
        tenant_id, _ = _make_tenant_and_program()
        resp = client.patch(f"{URL}{uuid.uuid4()}/", json={"name": "X"}, headers=_as(tenant_id))
        assert resp.status_code == 404

    def test_cannot_update_another_tenants_program(self):
        tenant_id, program_id = _make_tenant_and_program()
        other_tenant_id, _ = _make_tenant_and_program()
        resp = client.patch(f"{URL}{program_id}/", json={"name": "Piraté"}, headers=_as(other_tenant_id))
        assert resp.status_code == 404

        with SessionLocal() as db:
            row = db.query(Program).filter(Program.id == program_id).first()
            assert row.name == "Licence 1"


class TestDeleteProgram:
    def test_deletes_program(self):
        tenant_id, program_id = _make_tenant_and_program("Doctorat 3")
        resp = client.delete(f"{URL}{program_id}/", headers=_as(tenant_id))
        assert resp.status_code == 204

        with SessionLocal() as db:
            assert db.query(Program).filter(Program.id == program_id).first() is None

    def test_404_for_unknown_program(self):
        tenant_id, _ = _make_tenant_and_program()
        resp = client.delete(f"{URL}{uuid.uuid4()}/", headers=_as(tenant_id))
        assert resp.status_code == 404

    def test_cannot_delete_another_tenants_program(self):
        tenant_id, program_id = _make_tenant_and_program()
        other_tenant_id, _ = _make_tenant_and_program()
        resp = client.delete(f"{URL}{program_id}/", headers=_as(other_tenant_id))
        assert resp.status_code == 404

        with SessionLocal() as db:
            assert db.query(Program).filter(Program.id == program_id).first() is not None

    def test_deleting_program_nulls_classroom_link_instead_of_cascading(self):
        """Classroom.program_id is ON DELETE SET NULL — deleting a program
        must not take its classrooms down with it."""
        tenant_id, program_id = _make_tenant_and_program("Génie Informatique")
        classroom_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Classroom(id=classroom_id, tenant_id=tenant_id, name="GI 1", program_id=program_id))
            db.commit()

        resp = client.delete(f"{URL}{program_id}/", headers=_as(tenant_id))
        assert resp.status_code == 204

        with SessionLocal() as db:
            classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
            assert classroom is not None
            assert classroom.program_id is None
