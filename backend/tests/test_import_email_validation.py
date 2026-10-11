"""Régression : un e-mail refusé par le schéma de lecture ne doit plus
pouvoir entrer par un import CSV.

Bug trouvé en testant le cas réel Université La Source (2026-10-10) :
l'import élèves enregistrait `x@example.test` (domaine réservé), que
`EmailStr` du schéma `StudentList` refuse ensuite — GET /students/
répondait alors 500 pour TOUT l'établissement, à cause d'une seule ligne.
Les trois imports (élèves, enseignants, parents) et l'aperçu élèves
appliquent désormais la même règle que `EmailStr`.
"""
import csv
import io
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.parent_import import run_parent_import  # noqa: E402
from app.services.student_import import invalid_email_reason  # noqa: E402

postgres_only = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="confirm_student_import uses gen_random_uuid() (Postgres-only).",
)


def _make_csv(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=rows[0].keys(), delimiter=";")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _make_pro_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Import E-mails", slug=f"import-email-{tenant_id[:8]}",
            type="university", country="GN", is_active=True, settings={},
            subscription_plan="pro", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _admin_headers(tenant_id: str) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def _force_sync_fallback(monkeypatch):
    """Pas de worker ARQ en test : force le repli synchrone (même schéma
    que test_imports.py / test_import_teachers.py)."""
    from app.api.v1.endpoints.core import imports as imports_module

    async def _fail(*args, **kwargs):
        return None

    monkeypatch.setattr(imports_module, "enqueue_job", _fail)


def _confirm(kind: str, rows: list[dict], headers: dict) -> dict:
    resp = client.post(
        f"/api/v1/import/{kind}/confirm/",
        files={"file": (f"{kind}.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    job = client.get(f"/api/v1/import/jobs/{resp.json()['job_id']}/", headers=headers).json()
    assert job["status"] == "SUCCESS", job
    return job["result"]


STUDENT = {
    "prenom": "Mariama", "nom": "Diallo", "date_naissance": "2005-03-14", "sexe": "F",
    "matricule": "", "email": "", "email_parent": "",
}


class TestInvalidEmailReason:
    @pytest.mark.parametrize("value", ["a.b@example.com", "info@universitelasource.com", "x@ecole.gn"])
    def test_accepts_regular_addresses(self, value):
        assert invalid_email_reason(value) is None

    @pytest.mark.parametrize("value", ["a@example.test", "a@localhost", "pas-un-email", "a@@b.gn"])
    def test_rejects_what_emailstr_rejects(self, value):
        assert invalid_email_reason(value)


@postgres_only
class TestStudentImport:
    def test_invalid_email_row_is_rejected_and_student_list_stays_up(self):
        tenant_id = _make_pro_tenant()
        headers = _admin_headers(tenant_id)
        suffix = uuid.uuid4().hex[:6]
        rows = [
            {**STUDENT, "matricule": f"OK-{suffix}", "email": f"ok.{suffix}@example.com"},
            {**STUDENT, "prenom": "Alpha", "matricule": f"KO-{suffix}", "email": f"ko.{suffix}@example.test"},
            {**STUDENT, "prenom": "Hawa", "matricule": f"KP-{suffix}", "email_parent": "parent@localhost"},
        ]

        result = _confirm("students", rows, headers)

        assert result["created"] == 1
        assert result["skipped"] == 2
        errors = " ".join(e["error"] for e in result["errors"])
        assert "Email invalide" in errors and "Email parent invalide" in errors

        listing = client.get("/api/v1/students/", headers=headers)
        assert listing.status_code == 200, listing.text
        assert [s["registration_number"] for s in listing.json()["items"]] == [f"OK-{suffix}"]

    def test_preview_flags_invalid_email(self):
        tenant_id = _make_pro_tenant()
        resp = client.post(
            "/api/v1/import/students/preview/",
            files={"file": ("s.csv", io.BytesIO(_make_csv([{**STUDENT, "email": "x@example.test"}])), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["has_errors"] is True
        assert any("email invalide" in e for e in resp.json()["validation_errors"])


@postgres_only
class TestTeacherImport:
    def test_invalid_email_row_creates_no_account(self):
        tenant_id = _make_pro_tenant()
        email = f"prof.{uuid.uuid4().hex[:6]}@example.test"

        result = _confirm("teachers", [{"prenom": "Lamine", "nom": "Cisse", "email": email}],
                          _admin_headers(tenant_id))

        assert result["created"] == 0
        assert "Email invalide" in result["errors"][0]["error"]
        with SessionLocal() as db:
            assert db.query(User).filter(User.email == email).first() is None


@postgres_only
class TestParentImport:
    def test_invalid_email_row_creates_no_account(self):
        tenant_id = _make_pro_tenant()
        email = f"parent.{uuid.uuid4().hex[:6]}@example.test"
        headers = ["prenom", "nom", "email", "matricule_eleve"]
        rows = [{"prenom": "Oumar", "nom": "Bah", "email": email, "matricule_eleve": "X-1"}]

        with SessionLocal() as db:
            result = run_parent_import(db, tenant_id, headers, rows, skip_errors=True)
            db.rollback()

        assert result["created_parents"] == 0
        assert result["skipped_rows"] == 1
        assert "Email invalide" in result["error_rows"][0]["error"]
