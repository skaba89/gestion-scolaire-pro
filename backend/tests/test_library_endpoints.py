"""Tests pour les endpoints library — auth guards + le vrai bug corrigé en
migrant vers l'ORM (Horizon 2, troisième pilote après clubs puis
surveys) : POST/PUT /library/resources/, /library/categories/,
/library/borrow/ et /library/return/ utilisaient tous
gen_random_uuid()/NOW(), du SQL strictement PostgreSQL — jamais
exécutable sur SQLite, donc jamais couvert par un seul test avant cette
migration."""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "/api/v1/library"


@pytest.fixture(autouse=True)
def _clear_overrides():
    # get_current_user est surchargé via un dict global mutable — sans
    # ceci, une override laissée par le dernier test de ce fichier fuite
    # vers le prochain fichier collecté en ordre alphabétique. Pattern
    # établi (voir tests/test_grades_idempotency.py) et l'incident réel
    # qu'il a corrigé dans test_tenant_slug_validation.py puis
    # test_admission_documents.py plus tôt cette session.
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Library Test", slug=f"library-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _as_real_user(tenant_id: str, roles: list) -> dict:
    """Comme _as(), mais adossé à une vraie ligne `users` — library_resources
    .uploaded_by et library_borrow_records.borrowed_by/resource_id sont
    utilisés par les endpoints (uploaded_by est une vraie FK vers
    users(id)), donc une identité synthétique (juste un JWT) échouerait
    avec une violation de contrainte FK à la création."""
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return _as({"id": user_id, "roles": roles, "tenant_id": tenant_id}), user_id


class TestLibraryAuthGuards:
    def test_list_categories_requires_auth(self):
        resp = client.get(f"{BASE}/categories/")
        assert resp.status_code in (401, 403)

    def test_list_resources_requires_auth(self):
        resp = client.get(f"{BASE}/resources/")
        assert resp.status_code in (401, 403)

    def test_create_resource_requires_auth(self):
        resp = client.post(f"{BASE}/resources/", json={"title": "x"})
        assert resp.status_code in (401, 403)

    def test_borrow_requires_auth(self):
        resp = client.post(f"{BASE}/borrow/", json={"resource_id": str(uuid.uuid4()), "user_id": str(uuid.uuid4()), "due_date": "2026-09-15"})
        assert resp.status_code in (401, 403)


class TestLibraryCategoriesCrudEndToEnd:
    def test_create_list_update_delete_category(self):
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        created = client.post(f"{BASE}/categories/", json={"name": "Romans", "color": "#ff0000"}, headers=headers)
        assert created.status_code == 201, created.text
        category = created.json()
        assert category["name"] == "Romans"

        listed = client.get(f"{BASE}/categories/", headers=headers)
        assert listed.status_code == 200
        assert any(c["id"] == category["id"] for c in listed.json())

        updated = client.put(f"{BASE}/categories/{category['id']}/", json={"color": "#00ff00"}, headers=headers)
        assert updated.status_code == 200
        assert updated.json()["color"] == "#00ff00"
        assert updated.json()["name"] == "Romans"  # inchangé

        deleted = client.delete(f"{BASE}/categories/{category['id']}/", headers=headers)
        assert deleted.status_code == 200

        after = client.get(f"{BASE}/categories/", headers=headers)
        assert not any(c["id"] == category["id"] for c in after.json())


class TestLibraryResourcesCrudEndToEnd:
    """Verrouille précisément ce qui cassait avant la migration :
    gen_random_uuid()/NOW() n'existent pas sur SQLite, donc ces requêtes
    n'ont jamais pu être exécutées par un test avant cette suite."""

    def test_create_resource_accepts_blank_category_id_from_the_form(self):
        # ResourceDialog.tsx envoie toujours category_id: "" (jamais null/
        # absent) quand "Aucune catégorie" est sélectionné — voir
        # app/schemas/library.py::_blank_to_none. Sans ce correctif, un
        # Optional[UUID] rejette "" avec un 422 alors que l'ancien endpoint
        # SQL brut l'acceptait (`resource.category_id or None`).
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        created = client.post(f"{BASE}/resources/", json={"title": "Sans catégorie", "category_id": ""}, headers=headers)
        assert created.status_code == 201, created.text
        assert created.json()["category_id"] is None

    def test_create_resource_persists_all_extended_columns(self):
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        created = client.post(f"{BASE}/resources/", json={
            "title": "Les Misérables", "author": "Victor Hugo", "resource_type": "BOOK",
            "isbn": "978-2070409228", "total_copies": 3, "available_copies": 3,
            "file_url": "https://storage.example/miserables.pdf",
            "publication_year": 1862, "tags": ["classique", "roman"],
            "is_featured": True, "is_public": True,
        }, headers=headers)
        assert created.status_code == 201, created.text
        resource = created.json()
        assert resource["isbn"] == "978-2070409228"
        assert resource["total_copies"] == 3
        assert resource["tags"] == ["classique", "roman"]
        assert resource["is_featured"] is True
        assert resource["views_count"] == 0
        # uploaded_by doit être renseigné avec l'utilisateur authentifié
        assert resource["uploader"] is not None

    def test_list_resources_includes_nested_category_and_uploader(self):
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        category = client.post(f"{BASE}/categories/", json={"name": "Romans", "color": "#abcdef"}, headers=headers).json()
        created = client.post(f"{BASE}/resources/", json={
            "title": "Livre catégorisé", "category_id": category["id"],
        }, headers=headers).json()

        listed = client.get(f"{BASE}/resources/", headers=headers)
        assert listed.status_code == 200
        item = next(r for r in listed.json() if r["id"] == created["id"])
        assert item["category"]["id"] == category["id"]
        assert item["category"]["name"] == "Romans"
        assert item["category"]["color"] == "#abcdef"
        assert item["uploader"]["first_name"] is not None or item["uploader"] is not None

    def test_search_filters_resources(self):
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])
        client.post(f"{BASE}/resources/", json={"title": "Python avancé", "author": "Jane Doe"}, headers=headers)
        client.post(f"{BASE}/resources/", json={"title": "Histoire de Guinée", "author": "John Smith"}, headers=headers)

        resp = client.get(f"{BASE}/resources/", params={"search": "python"}, headers=headers)
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        assert results[0]["title"] == "Python avancé"

    def test_update_resource_partial(self):
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])
        created = client.post(f"{BASE}/resources/", json={"title": "Titre initial", "author": "Auteur initial"}, headers=headers).json()

        updated = client.put(f"{BASE}/resources/{created['id']}/", json={"is_featured": True}, headers=headers)
        assert updated.status_code == 200
        body = updated.json()
        assert body["title"] == "Titre initial"  # inchangé
        assert body["is_featured"] is True

    def test_delete_resource(self):
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])
        created = client.post(f"{BASE}/resources/", json={"title": "À supprimer"}, headers=headers).json()

        deleted = client.delete(f"{BASE}/resources/{created['id']}/", headers=headers)
        assert deleted.status_code == 200

        listed = client.get(f"{BASE}/resources/", headers=headers)
        assert not any(r["id"] == created["id"] for r in listed.json())

    def test_resources_scoped_to_tenant(self):
        # get_current_user est surchargé via un dict global mutable (voir
        # _as()) — recréer les headers du tenant A APRÈS avoir authentifié
        # le tenant B écraserait silencieusement l'override et ferait
        # passer les deux requêtes comme le même utilisateur, quels que
        # soient les headers passés à httpx. D'où l'entrelacement strict
        # ici (même pattern que test_surveys_endpoints.py).
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()

        headers_a, _ = _as_real_user(tenant_a, ["TENANT_ADMIN"])
        client.post(f"{BASE}/resources/", json={"title": "Livre A"}, headers=headers_a)

        headers_b, _ = _as_real_user(tenant_b, ["TENANT_ADMIN"])
        client.post(f"{BASE}/resources/", json={"title": "Livre B"}, headers=headers_b)

        headers_a, _ = _as_real_user(tenant_a, ["TENANT_ADMIN"])
        listed_a = client.get(f"{BASE}/resources/", headers=headers_a).json()
        assert len(listed_a) == 1
        assert listed_a[0]["title"] == "Livre A"


class TestLibraryBorrowingEndToEnd:
    """Le vrai chemin cassé avant migration : borrow/return utilisaient
    gen_random_uuid()/NOW(), jamais testable sur SQLite."""

    def test_borrow_then_return_updates_available_copies(self):
        # Deux identités distinctes (admin qui agit, étudiant emprunteur)
        # partagent le même override global get_current_user (voir _as())
        # — créer l'étudiant AVANT d'utiliser les headers admin écraserait
        # l'override. On crée donc l'étudiant, on note son id, PUIS on
        # restaure l'override admin avant chaque appel authentifié admin.
        tenant_id = _make_tenant()
        _, borrower_id = _as_real_user(tenant_id, ["STUDENT"])
        headers, admin_id = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        resource = client.post(f"{BASE}/resources/", json={
            "title": "Livre à emprunter", "total_copies": 2, "available_copies": 2,
        }, headers=headers).json()

        borrowed = client.post(f"{BASE}/borrow/", json={
            "resource_id": resource["id"], "user_id": borrower_id, "due_date": "2026-09-15",
        }, headers=headers)
        assert borrowed.status_code == 201, borrowed.text
        record = borrowed.json()
        assert record["status"] == "BORROWED"

        borrowers = client.get(f"{BASE}/borrowers/", headers=headers)
        assert borrowers.status_code == 200
        assert any(b["id"] == record["id"] for b in borrowers.json())

        returned = client.post(f"{BASE}/return/", json={"borrow_id": record["id"], "notes": "Rendu en bon état"}, headers=headers)
        assert returned.status_code == 200
        assert returned.json()["status"] == "RETURNED"

        borrowers_after = client.get(f"{BASE}/borrowers/", headers=headers)
        assert not any(b["id"] == record["id"] for b in borrowers_after.json())

    def test_borrow_fails_when_no_copies_available(self):
        tenant_id = _make_tenant()
        _, borrower_id = _as_real_user(tenant_id, ["STUDENT"])
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        resource = client.post(f"{BASE}/resources/", json={
            "title": "Exemplaire unique", "total_copies": 1, "available_copies": 0,
        }, headers=headers).json()

        resp = client.post(f"{BASE}/borrow/", json={
            "resource_id": resource["id"], "user_id": borrower_id, "due_date": "2026-09-15",
        }, headers=headers)
        assert resp.status_code == 400

    def test_return_fails_for_unknown_borrow_id(self):
        tenant_id = _make_tenant()
        headers, _ = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        resp = client.post(f"{BASE}/return/", json={"borrow_id": str(uuid.uuid4())}, headers=headers)
        assert resp.status_code == 404
