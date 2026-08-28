"""DELETE /tenants/{id}/ — vraie cause racine trouvée (2026-08-28), après
deux correctifs qui n'ont rien changé (PR #135 : sweep CASCADE générique ;
PR #136 : diagnostic amélioré exposant l'erreur Postgres brute).

Le message d'erreur brut obtenu grâce à PR #136 a révélé que ce n'était
PAS une violation de clé étrangère : c'était
    null value in column "tenant_id" of relation "public_pages"
    violates not-null constraint
— une violation NOT NULL. `delete_rule(s) FK actuel(s)=['CASCADE']` dans
le même message confirmait que la contrainte CASCADE en base a TOUJOURS
été correcte (donc PR #135 corrigeait un problème qui n'existait pas).

Cause réelle : `Tenant.public_pages` (comme `Tenant.users` et
`Tenant.students`) est une relationship() SQLAlchemy sans
`passive_deletes=True`. Par défaut, SQLAlchemy charge la collection
enfant en mémoire lors d'un `db.delete(parent)` et lui applique SA
PROPRE logique de désassociation — un UPDATE qui met la clé étrangère à
NULL sur chaque ligne enfant déjà trackée — AVANT même que la ligne
parente n'atteigne la base et ne déclenche le vrai ON DELETE CASCADE de
Postgres. Comme tenant_id est NOT NULL partout (TenantMixin), cet UPDATE
échouait. `passive_deletes=True` dit à SQLAlchemy de ne rien faire lui-
même et de faire confiance à la contrainte FK ON DELETE CASCADE déjà en
place — voir app/models/tenant.py pour le détail complet.

Ce module verrouille que la suppression d'un tenant AVEC des lignes
réelles dans public_pages/users/students réussit désormais sans
exception, et que ces lignes enfants sont bien supprimées par cascade
(pas seulement "non plantées") — testable sur SQLite ici puisque le
moteur de test active PRAGMA foreign_keys=ON (voir
app/core/database.py) et que la déclaration ON DELETE CASCADE est
répercutée dans le DDL SQLite comme PostgreSQL."""
import uuid

import pytest

from conftest import get_test_client

client = get_test_client()

from datetime import date

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.main import app  # noqa: E402
from app.models.public_page import PublicPage  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "/api/v1/tenants"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as_super_admin() -> dict:
    user = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": None, "roles": user["roles"]})
    return {"Authorization": f"Bearer {token}"}


class TestDeleteTenantWithRealChildRows:
    def test_deletes_a_tenant_that_has_public_pages_without_raising(self):
        """Le bug réellement rencontré en production : un tenant université
        avec au moins une public_page (ex. 'Recherche') ne pouvait pas être
        supprimé."""
        tenant_id = str(uuid.uuid4())
        page_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="Université ORM Cascade Test", slug=f"orm-cascade-{tenant_id[:8]}",
                type="university", country="GN", is_active=True, settings={},
            ))
            db.commit()
            db.add(PublicPage(
                id=page_id, tenant_id=tenant_id, title="Recherche", slug="recherche",
                page_type="RESEARCH", content=[],
            ))
            db.commit()

        headers = _as_super_admin()
        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            assert db.get(Tenant, tenant_id) is None
            # La ligne enfant doit avoir été supprimée par le vrai ON DELETE
            # CASCADE de la base — pas laissée orpheline, et surtout pas
            # avoir provoqué de violation NOT NULL au passage.
            assert db.get(PublicPage, page_id) is None

    def test_deletes_a_tenant_that_has_users_and_students_without_raising(self):
        """Le même piège ORM s'appliquait à `students` (tenant_id NOT NULL
        comme public_pages) et, différemment, à `users` : User.tenant_id
        est délibérément nullable (les comptes SUPER_ADMIN n'ont pas de
        tenant), donc l'ancien comportement ORM ne plantait pas dessus
        mais orphelinait silencieusement les comptes (tenant_id mis à NULL
        au lieu d'être supprimés) — un vrai bug de correction différent,
        jamais visible en erreur, corrigé par le même passive_deletes=True
        (voir app/models/tenant.py)."""
        tenant_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(Tenant(
                id=tenant_id, name="École ORM Cascade Test", slug=f"orm-cascade-us-{tenant_id[:8]}",
                type="primary", country="GN", is_active=True, settings={},
            ))
            db.commit()
            db.add(User(
                id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
                username=f"user-{user_id[:8]}", password_hash=get_password_hash("Test1234!"),
                first_name="Test", last_name="User", is_active=True,
            ))
            db.add(Student(
                id=student_id, tenant_id=tenant_id, registration_number=f"STU-{student_id[:8]}",
                first_name="Test", last_name="Student", date_of_birth=date(2010, 1, 1),
                gender=Gender.OTHER,
            ))
            db.commit()

        headers = _as_super_admin()
        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            assert db.get(Tenant, tenant_id) is None
            # Avant le correctif : ce user survivait avec tenant_id=NULL
            # (silencieusement orphelin) plutôt que d'être supprimé.
            assert db.get(User, user_id) is None
            assert db.get(Student, student_id) is None
