"""Tests pour l'import CSV de parents (commercialisation, Priorité 1).

Contrairement à l'import élèves, un parent importé doit produire un vrai
compte lié (users + user_roles PARENT) et un lien parent_students vers
chaque élève référencé -- jamais juste du texte libre parent_name/
parent_phone sur Student.
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
from app.models.parent_student import ParentStudent  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="RLS-backed tables (parent_students, students) are exercised against Postgres in this suite.",
)

PREVIEW_URL = "/api/v1/import/parents/preview/"
CONFIRM_URL = "/api/v1/import/parents/confirm/"
TEMPLATE_URL = "/api/v1/import/parents/template/"


def _make_csv(rows: list[dict], delimiter: str = ";") -> bytes:
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=rows[0].keys(), delimiter=delimiter)
        writer.writeheader()
        writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _make_pro_tenant(name: str = "École Import Parents") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name=name, slug=f"import-parents-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
            subscription_plan="pro", subscription_status="trialing",
        ))
        db.commit()
    return tenant_id


def _make_student(tenant_id: str, *, reg: str, email: str | None = None) -> str:
    """`registration_number` is UNIQUE globally (not per-tenant) on the
    Student model — the caller's `reg` prefix is suffixed with a random
    hex to stay unique across test runs sharing one database."""
    student_id = str(uuid.uuid4())
    unique_reg = f"{reg}-{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        db.add(Student(
            id=student_id, tenant_id=tenant_id, registration_number=unique_reg,
            first_name="Enfant", last_name=reg, date_of_birth="2012-01-01",
            gender=Gender.MALE, status=StudentStatus.ACTIVE, email=email,
        ))
        db.commit()
    return student_id, unique_reg


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


class TestAuthRequired:
    def test_preview_without_auth_returns_401(self):
        resp = client.post(PREVIEW_URL, files={"file": ("p.csv", io.BytesIO(b"x"), "text/csv")})
        assert resp.status_code == 401

    def test_confirm_without_auth_returns_401(self):
        resp = client.post(CONFIRM_URL, files={"file": ("p.csv", io.BytesIO(b"x"), "text/csv")})
        assert resp.status_code == 401


class TestTemplate:
    def test_template_downloads_csv(self):
        tenant_id = _make_pro_tenant()
        resp = client.get(TEMPLATE_URL, headers=_admin_headers(tenant_id))
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"].startswith("text/csv")
        assert "matricule" in resp.text.lower() or "matricule_eleve" in resp.text.lower()


class TestPreview:
    def test_preview_flags_missing_required_fields(self):
        tenant_id = _make_pro_tenant()
        rows = [{"prenom": "", "nom": "Diallo", "email": "", "matricule_eleve": ""}]
        resp = client.post(
            PREVIEW_URL,
            files={"file": ("p.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["has_errors"] is True


class TestImportValidParents:
    def test_import_creates_real_linked_parent_account(self):
        """Un parent importé doit être un vrai compte users+user_roles lié
        via parent_students -- pas juste du texte libre."""
        tenant_id = _make_pro_tenant()
        student_id, reg = _make_student(tenant_id, reg="ETU-P-001")
        rows = [{
            "prenom": "Mamadou", "nom": "Diallo", "email": f"mamadou.{uuid.uuid4().hex[:6]}@ecole.gn",
            "telephone": "+224620000001", "matricule_eleve": reg, "lien": "FATHER",
            "contact_principal": "oui",
        }]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("p.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created_parents"] == 1
        assert body["created_links"] == 1

        with SessionLocal() as db:
            parent = db.query(User).filter(User.email == rows[0]["email"]).first()
            assert parent is not None
            assert parent.tenant_id is not None
            assert str(parent.tenant_id) == tenant_id

            role = db.query(UserRole).filter(UserRole.user_id == parent.id, UserRole.tenant_id == tenant_id).first()
            assert role is not None
            assert role.role == "PARENT"

            link = db.query(ParentStudent).filter(
                ParentStudent.tenant_id == tenant_id,
                ParentStudent.parent_id == parent.id,
                ParentStudent.student_id == student_id,
            ).first()
            assert link is not None
            assert link.relation_type == "FATHER"
            assert link.is_primary is True

    def test_import_multiple_children_same_parent_reuses_account(self):
        """Un parent avec deux enfants (deux lignes, même email) doit
        produire UN SEUL compte et DEUX liens -- pas deux comptes."""
        tenant_id = _make_pro_tenant()
        _, reg1 = _make_student(tenant_id, reg="ETU-P-010")
        _, reg2 = _make_student(tenant_id, reg="ETU-P-011")
        email = f"parent2.{uuid.uuid4().hex[:6]}@ecole.gn"
        rows = [
            {"prenom": "Aissatou", "nom": "Konaté", "email": email, "matricule_eleve": reg1},
            {"prenom": "Aissatou", "nom": "Konaté", "email": email, "matricule_eleve": reg2},
        ]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("p.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Same batch: row 2 reuses the in-memory parent created by row 1
        # (not yet committed to re-query), so it counts as created once,
        # never as a DB-level "reused" (that's covered by the cross-batch
        # test below).
        assert body["created_parents"] == 1
        assert body["reused_parents"] == 0
        assert body["created_links"] == 2

        with SessionLocal() as db:
            count = db.query(User).filter(User.email == email).count()
            assert count == 1


class TestImportAlreadyExistingParent:
    def test_reimporting_same_parent_reuses_and_adds_new_link_only(self):
        """Importer un parent déjà existant (même email, même tenant) doit
        réutiliser le compte et ajouter uniquement le nouveau lien, sans
        dupliquer le compte ni écraser ses champs."""
        tenant_id = _make_pro_tenant()
        _, reg1 = _make_student(tenant_id, reg="ETU-P-020")
        _, reg2 = _make_student(tenant_id, reg="ETU-P-021")
        email = f"existing.{uuid.uuid4().hex[:6]}@ecole.gn"

        first_rows = [{"prenom": "Jean", "nom": "Camara", "email": email, "matricule_eleve": reg1}]
        resp1 = client.post(
            CONFIRM_URL,
            files={"file": ("p1.csv", io.BytesIO(_make_csv(first_rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp1.status_code == 200, resp1.text
        assert resp1.json()["created_parents"] == 1

        second_rows = [{"prenom": "Jean", "nom": "Camara", "email": email, "matricule_eleve": reg2}]
        resp2 = client.post(
            CONFIRM_URL,
            files={"file": ("p2.csv", io.BytesIO(_make_csv(second_rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp2.status_code == 200, resp2.text
        body2 = resp2.json()
        assert body2["created_parents"] == 0
        assert body2["reused_parents"] == 1
        assert body2["created_links"] == 1

        with SessionLocal() as db:
            assert db.query(User).filter(User.email == email).count() == 1
            links = db.query(ParentStudent).filter(ParentStudent.parent_id.in_(
                db.query(User.id).filter(User.email == email)
            )).count()
            assert links == 2

    def test_reimporting_same_row_twice_does_not_duplicate_link(self):
        tenant_id = _make_pro_tenant()
        _, reg = _make_student(tenant_id, reg="ETU-P-030")
        email = f"dup.{uuid.uuid4().hex[:6]}@ecole.gn"
        rows = [{"prenom": "Marie", "nom": "Bah", "email": email, "matricule_eleve": reg}]

        headers = _admin_headers(tenant_id)
        resp1 = client.post(CONFIRM_URL, files={"file": ("a.csv", io.BytesIO(_make_csv(rows)), "text/csv")}, headers=headers)
        assert resp1.json()["created_links"] == 1

        resp2 = client.post(CONFIRM_URL, files={"file": ("b.csv", io.BytesIO(_make_csv(rows)), "text/csv")}, headers=headers)
        assert resp2.status_code == 200, resp2.text
        assert resp2.json()["created_links"] == 0
        assert resp2.json()["skipped_links"] == 1


class TestFileWithErrors:
    def test_row_missing_student_reference_is_skipped_not_crashed(self):
        tenant_id = _make_pro_tenant()
        rows = [{"prenom": "Sans", "nom": "Enfant", "email": f"orphan.{uuid.uuid4().hex[:6]}@ecole.gn", "matricule_eleve": ""}]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("p.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created_parents"] == 0
        assert body["skipped_rows"] == 1
        assert len(body["errors"]) == 1

    def test_row_with_unknown_matricule_reports_error_but_continues(self):
        tenant_id = _make_pro_tenant()
        rows = [{"prenom": "X", "nom": "Y", "email": f"ghost.{uuid.uuid4().hex[:6]}@ecole.gn", "matricule_eleve": "DOES-NOT-EXIST"}]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("p.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert any("introuvable" in e["error"] for e in body["errors"])


class TestTenantIsolation:
    def test_tenant_a_cannot_link_parent_to_student_of_tenant_b(self):
        tenant_a = _make_pro_tenant("École A")
        tenant_b = _make_pro_tenant("École B")
        _, reg = _make_student(tenant_b, reg="ETU-CROSS-001")  # belongs to tenant B only

        rows = [{"prenom": "Cross", "nom": "Tenant", "email": f"cross.{uuid.uuid4().hex[:6]}@ecole.gn", "matricule_eleve": reg}]
        resp = client.post(
            CONFIRM_URL,
            files={"file": ("p.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_a),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created_links"] == 0
        assert any("introuvable" in e["error"] for e in body["errors"])

        with SessionLocal() as db:
            assert db.query(ParentStudent).filter(ParentStudent.tenant_id == tenant_a).count() == 0


class TestAuditLog:
    def test_confirm_import_writes_audit_log(self):
        tenant_id = _make_pro_tenant()
        _, reg = _make_student(tenant_id, reg="ETU-AUDIT-001")
        rows = [{"prenom": "Audit", "nom": "Test", "email": f"audit.{uuid.uuid4().hex[:6]}@ecole.gn", "matricule_eleve": reg}]

        resp = client.post(
            CONFIRM_URL,
            files={"file": ("parents.csv", io.BytesIO(_make_csv(rows)), "text/csv")},
            headers=_admin_headers(tenant_id),
        )
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            entry = db.query(AuditLog).filter(
                AuditLog.tenant_id == tenant_id, AuditLog.action == "IMPORT_PARENTS",
            ).first()
            assert entry is not None
            assert entry.details.get("created_parents") == 1
            assert entry.details.get("filename") == "parents.csv"
