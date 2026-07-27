"""Tests pour l'import CSV d'enseignants (commercialisation, Priorité 2).

Réutilise TEACHER_COLUMN_MAP (déjà présent dans imports.py, jusque-là mort
-- aucun endpoint ne l'utilisait). Contrairement aux parents, un email en
doublon est un échec dur : deux personnes différentes ne partagent jamais
légitimement un compte enseignant, donc aucune réutilisation silencieuse.
"""
import io
import csv
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (users/user_roles) are exercised against Postgres in this suite.",
)

PREVIEW_URL = "/api/v1/import/teachers/preview/"
CONFIRM_URL = "/api/v1/import/teachers/confirm/"
TEMPLATE_URL = "/api/v1/import/teachers/template/"


def _make_csv(rows: list[dict], delimiter: str = ";") -> bytes:
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=rows[0].keys(), delimiter=delimiter)
        writer.writeheader()
        writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _make_pro_tenant(name: str = "École Import Enseignants") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"import-teachers-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="pro", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _admin_headers(tenant_id: str) -> dict:
    return _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})


VALID_ROW = {
    "prenom": "Fatoumata", "nom": "Bah", "email": "",
    "telephone": "+224620000010", "matieres": "Mathématiques",
    "diplome": "Master", "departement": "Sciences", "type_contrat": "CDI",
    "date_naissance": "10/05/1985", "sexe": "F", "date_embauche": "01/09/2020",
}


class TestAuthRequired:
    def test_preview_without_auth_returns_401(self):
        resp = client.post(PREVIEW_URL, files={"file": ("t.csv", io.BytesIO(b"x"), "text/csv")})
        assert resp.status_code == 401

    def test_confirm_without_auth_returns_401(self):
        resp = client.post(CONFIRM_URL, files={"file": ("t.csv", io.BytesIO(b"x"), "text/csv")})
        assert resp.status_code == 401


class TestTemplate:
    def test_template_downloads_csv(self):
        tenant_id = _make_pro_tenant()
        resp = client.get(TEMPLATE_URL, headers=_admin_headers(tenant_id))
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/csv")
        assert "matieres" in resp.text.lower() or "matières" in resp.text.lower()


class TestPreview:
    def test_preview_flags_missing_required_fields(self):
        tenant_id = _make_pro_tenant()
        rows = [{**VALID_ROW, "prenom": "", "email": ""}]
        resp = client.post(
            PREVIEW_URL,
            files={"file": ("t.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["has_errors"] is True

    def test_preview_reports_detected_mapping_including_subjects(self):
        tenant_id = _make_pro_tenant()
        rows = [{**VALID_ROW, "email": f"preview.{uuid.uuid4().hex[:6]}@ecole.gn"}]
        resp = client.post(
            PREVIEW_URL,
            files={"file": ("t.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["mapping"]["subjects"] is not None


class TestImportValidTeachers:
    def test_import_creates_real_teacher_account_with_role(self):
        tenant_id = _make_pro_tenant()
        email = f"teacher.{uuid.uuid4().hex[:6]}@ecole.gn"
        rows = [{**VALID_ROW, "email": email}]

        resp = client.post(
            CONFIRM_URL,
            files={"file": ("t.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["created"] == 1

        with SessionLocal() as db:
            teacher = db.query(User).filter(User.email == email).first()
            assert teacher is not None
            assert str(teacher.tenant_id) == tenant_id
            assert teacher.first_name == "Fatoumata"

            role = db.query(UserRole).filter(UserRole.user_id == teacher.id, UserRole.tenant_id == tenant_id).first()
            assert role is not None
            assert role.role == "TEACHER"

    def test_import_multiple_valid_teachers(self):
        tenant_id = _make_pro_tenant()
        rows = [
            {**VALID_ROW, "email": f"t1.{uuid.uuid4().hex[:6]}@ecole.gn"},
            {**VALID_ROW, "prenom": "Ousmane", "email": f"t2.{uuid.uuid4().hex[:6]}@ecole.gn"},
        ]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("t.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["created"] == 2


class TestDuplicateEmail:
    def test_duplicate_email_in_db_is_skipped_never_overwritten(self):
        """Aucun écrasement silencieux : un email déjà utilisé (même par un
        compte d'un autre rôle/tenant) doit être ignoré, jamais réécrit."""
        tenant_id = _make_pro_tenant()
        email = f"dup.{uuid.uuid4().hex[:6]}@ecole.gn"

        rows = [{**VALID_ROW, "email": email}]
        headers = _admin_headers(tenant_id)
        resp1 = client.post(CONFIRM_URL, files={"file": ("a.csv", io.BytesIO(_make_csv(rows)), "text/csv")}, headers=headers)
        assert resp1.json()["created"] == 1

        # Re-import with a DIFFERENT name for the same email.
        rows2 = [{**VALID_ROW, "prenom": "Autre", "nom": "Personne", "email": email}]
        resp2 = client.post(CONFIRM_URL, files={"file": ("b.csv", io.BytesIO(_make_csv(rows2)), "text/csv")}, headers=headers)
        assert resp2.status_code == 200, resp2.text
        body2 = resp2.json()
        assert body2["created"] == 0
        assert body2["skipped"] == 1
        assert any("existe déjà" in e["error"] for e in body2["errors"])

        with SessionLocal() as db:
            teacher = db.query(User).filter(User.email == email).first()
            # Original name preserved -- not overwritten by the second import.
            assert teacher.first_name == "Fatoumata"
            assert db.query(User).filter(User.email == email).count() == 1

    def test_duplicate_email_within_same_file_is_skipped(self):
        tenant_id = _make_pro_tenant()
        email = f"samefile.{uuid.uuid4().hex[:6]}@ecole.gn"
        rows = [{**VALID_ROW, "email": email}, {**VALID_ROW, "prenom": "Second", "email": email}]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("t.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created"] == 1
        assert body["skipped"] == 1


class TestFileWithErrors:
    def test_row_missing_email_is_skipped_not_crashed(self):
        tenant_id = _make_pro_tenant()
        rows = [{**VALID_ROW, "email": ""}]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("t.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created"] == 0
        assert body["skipped"] == 1


class TestTenantIsolation:
    def test_teacher_created_in_tenant_a_not_visible_in_tenant_b(self):
        tenant_a = _make_pro_tenant("École Prof A")
        tenant_b = _make_pro_tenant("École Prof B")
        email = f"isolated.{uuid.uuid4().hex[:6]}@ecole.gn"
        rows = [{**VALID_ROW, "email": email}]

        resp = client.post(
            CONFIRM_URL,
            files={"file": ("t.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_a),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["created"] == 1

        with SessionLocal() as db:
            teacher = db.query(User).filter(User.email == email).first()
            assert str(teacher.tenant_id) == tenant_a
            assert str(teacher.tenant_id) != tenant_b
            role_in_b = db.query(UserRole).filter(
                UserRole.user_id == teacher.id, UserRole.tenant_id == tenant_b,
            ).first()
            assert role_in_b is None


class TestAuditLog:
    def test_confirm_import_writes_audit_log(self):
        tenant_id = _make_pro_tenant()
        email = f"audit.{uuid.uuid4().hex[:6]}@ecole.gn"
        rows = [{**VALID_ROW, "email": email}]

        resp = client.post(
            CONFIRM_URL,
            files={"file": ("teachers.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            entry = db.query(AuditLog).filter(
                AuditLog.tenant_id == tenant_id, AuditLog.action == "IMPORT_TEACHERS",
            ).first()
            assert entry is not None
            assert entry.details.get("created") == 1
            assert entry.details.get("filename") == "teachers.csv"
