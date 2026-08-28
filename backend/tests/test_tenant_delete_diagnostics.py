"""DELETE /tenants/{id}/ — signalé en direct par un utilisateur (capture
d'écran) : "j'arrive pas à supprimer les établissements", avec le
message générique "Erreur lors de la suppression de l'établissement.
Vérifiez que toutes les contraintes de base de données sont
correctement configurées (CASCADE)."

Un audit chronologique complet de toutes les migrations Alembic n'a
trouvé AUCUNE table dont la FK tenant_id vers tenants(id) manque encore
ON DELETE CASCADE dans le code actuel — donc le vrai problème n'est très
probablement pas ici, mais soit une base de données réelle en retard sur
les migrations, soit une interaction RLS. Impossible de trancher car le
code AVALAIT l'erreur Postgres réelle (constraint_name/table_name) dans
les logs serveur, jamais visible par le SUPER_ADMIN qui clique sur le
bouton et n'a pas accès à ces logs.

Ce module verrouille que la table et la contrainte réellement en cause
sont désormais renvoyées dans le message d'erreur (endpoint
SUPER_ADMIN-only, donc pas de fuite cross-tenant à exposer ce détail),
et que le comportement générique existant est préservé pour toute autre
erreur non-FK.

SUITE (2026-08-27) : en production, la table réellement bloquante s'est
avérée être 'public_pages' — mais avec `.diag.constraint_name` revenant
`None`, rendant le message "il lui manque ON DELETE CASCADE" (une
supposition, jamais vérifiée) trompeur. Un correctif de migration
(PR #135, sweep générique ON DELETE CASCADE) a été déployé mais n'a rien
changé au comportement — signe que la cause n'était probablement pas un
CASCADE manquant après tout. Ce module verrouille maintenant aussi
l'exposition du message Postgres brut (`str(exc.orig)`) et d'un contrôle
en direct du `delete_rule` réel de la table bloquante, pour obtenir un
fait vérifié plutôt qu'une hypothèse la prochaine fois."""
import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

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


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Delete Diagnostics Test", slug=f"delete-diag-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class _FakeDiag:
    def __init__(self, constraint_name, table_name):
        self.constraint_name = constraint_name
        self.table_name = table_name


class _FakeDriverError(Exception):
    """Stand-in for psycopg's underlying error object, which carries
    `.diag.constraint_name`/`.diag.table_name` — the real production
    detail this fix extracts instead of discarding."""
    def __init__(self, diag):
        super().__init__("foreign key violation")
        self.diag = diag


class TestDeleteTenantSurfacesTheRealForeignKeyViolation:
    def test_reports_the_blocking_table_and_constraint_by_name(self, monkeypatch):
        tenant_id = _make_tenant()
        headers = _as_super_admin()

        orig = _FakeDriverError(_FakeDiag(
            constraint_name="students_tenant_id_fkey",
            table_name="students",
        ))

        def _raise_fk_violation(self, *args, **kwargs):
            raise IntegrityError("DELETE FROM tenants WHERE id = %s", {}, orig)

        monkeypatch.setattr(Session, "commit", _raise_fk_violation)

        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert "students" in detail
        assert "students_tenant_id_fkey" in detail
        # Le message Postgres brut (str(exc.orig)) est désormais toujours
        # exposé tel quel — plus fiable que les seuls champs .diag
        # structurés, qui peuvent revenir vides selon le driver (voir
        # test_reports_the_raw_postgres_error_even_when_diag_constraint_name_is_none
        # ci-dessous, cas réellement rencontré en production sur
        # 'public_pages').
        assert "foreign key violation" in detail

    def test_reports_the_raw_postgres_error_even_when_diag_constraint_name_is_none(self, monkeypatch):
        """Cas réellement rencontré en production (2026-08-27) : le driver
        remplit .diag.table_name ('public_pages') mais PAS
        .diag.constraint_name (None) — le message doit rester exploitable
        malgré ça, en s'appuyant sur le texte d'erreur Postgres brut plutôt
        que sur la seule supposition "il lui manque CASCADE" (qui s'est
        révélée être une fausse piste : le sweep de PR #135 n'a rien
        trouvé à corriger sur cette contrainte)."""
        tenant_id = _make_tenant()
        headers = _as_super_admin()

        orig = _FakeDriverError(_FakeDiag(constraint_name=None, table_name="public_pages"))

        def _raise_fk_violation(self, *args, **kwargs):
            raise IntegrityError("DELETE FROM tenants WHERE id = %s", {}, orig)

        monkeypatch.setattr(Session, "commit", _raise_fk_violation)

        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert "public_pages" in detail
        assert "foreign key violation" in detail

    def test_falls_back_to_a_generic_message_when_the_driver_gives_no_diagnostics(self, monkeypatch):
        # A synthetic IntegrityError whose .orig has no .diag at all (e.g.
        # a non-psycopg backend, or a genuinely bare exception) must not
        # crash the error handler itself — it degrades to an honest
        # "check the server logs" message instead of a raw AttributeError.
        tenant_id = _make_tenant()
        headers = _as_super_admin()

        def _raise_bare_integrity_error(self, *args, **kwargs):
            raise IntegrityError("DELETE FROM tenants WHERE id = %s", {}, Exception("constraint violation"))

        monkeypatch.setattr(Session, "commit", _raise_bare_integrity_error)

        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert "constraint violation" in detail

    def test_non_integrity_errors_keep_the_original_generic_message(self, monkeypatch):
        # Regression guard: an unrelated failure (not a DB constraint at
        # all) must still hit the pre-existing generic branch, unchanged.
        tenant_id = _make_tenant()
        headers = _as_super_admin()

        def _raise_unexpected_error(self, *args, **kwargs):
            raise RuntimeError("something unrelated broke")

        monkeypatch.setattr(Session, "commit", _raise_unexpected_error)

        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)

        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert detail == (
            "Erreur lors de la suppression de l'établissement. "
            "Vérifiez que toutes les contraintes de base de données sont correctement configurées (CASCADE)."
        )

    def test_successful_delete_is_unaffected(self):
        tenant_id = _make_tenant()
        headers = _as_super_admin()

        resp = client.delete(f"{BASE}/{tenant_id}/", headers=headers)
        assert resp.status_code == 200, resp.text

        with SessionLocal() as db:
            assert db.get(Tenant, tenant_id) is None
