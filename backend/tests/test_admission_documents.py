"""Dossier de candidature — les documents joints par le candidat
(admission_applications.documents, un blob JSON par pièce, voir
public_upload_document()/public_apply() dans admissions.py) n'étaient
jamais renvoyés d'une façon exploitable par l'admin : aucun test
n'existait pour ce module avant cette suite, et la table admissions
n'affichait que la demande, jamais les pièces jointes (signalé par un
utilisateur — "on ne voit pas les pièces mais on voit la demande").

Couvre _refresh_document_urls() : les URLs stockées à l'upload doivent
être re-signées à la lecture (les presigned URLs MinIO expirent au bout
de 7 jours — un dossier consulté des semaines après sa soumission
afficherait sinon un lien mort pour un document qui existe réellement),
et ce sur le chemin raw SQL réellement utilisé par list_admissions()/
get_admission() — pas seulement la fonction en isolation.
"""
import uuid
from datetime import date

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admission import AdmissionApplication, AdmissionStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

BASE = "/api/v1/admissions"


@pytest.fixture(autouse=True)
def _clear_overrides():
    # get_current_user is overridden via a single global mutable dict —
    # without this, an override set by the last test in this file leaks
    # into whichever test file collects next alphabetically. Established
    # pattern, see tests/test_grades_idempotency.py and the real incident
    # this exact fixture fixed in test_tenant_slug_validation.py earlier
    # this session.
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
            id=tenant_id, name="École Admission Docs Test", slug=f"admission-docs-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _submit_application_with_documents(tenant_id: str) -> str:
    """Insère directement via l'ORM plutôt que d'appeler
    POST /admissions/public/apply/ : cet endpoint utilise du SQL brut
    spécifique PostgreSQL (gen_random_uuid(), NOW(), RETURNING *) — cassé
    sur SQLite ("no such function: gen_random_uuid"), donc jamais
    exerçable en test tel quel (fonctionne en production sur le vrai
    Postgres, aucun bug utilisateur réel — juste un chemin non testable
    localement, signalé séparément). Ce test couvre le chemin de LECTURE
    (_refresh_document_urls / list_admissions / get_admission), pas
    l'écriture."""
    documents = [
        {
            "key": f"admissions/{tenant_id}/piece1.pdf",
            "url": "https://old-expired-presigned-url.example/piece1.pdf",
            "filename": "extrait_naissance.pdf",
            "document_type": "birth_certificate",
        },
        {
            "key": f"admissions/{tenant_id}/piece2.jpg",
            "url": "https://old-expired-presigned-url.example/piece2.jpg",
            "filename": "photo.jpg",
            "document_type": "id_photo",
        },
    ]
    app_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AdmissionApplication(
            id=app_id, tenant_id=tenant_id,
            student_first_name="Awa", student_last_name="Camara",
            student_date_of_birth=date(2012, 3, 1), student_gender="F",
            parent_first_name="Mariam", parent_last_name="Camara",
            parent_email="mariam.camara@example.com", parent_phone="+224600000001",
            status=AdmissionStatus.SUBMITTED, documents=documents,
        ))
        db.commit()
    return app_id


class TestAdmissionDocumentsVisibleToAdmin:
    """Le vrai bug signalé : la demande était visible, jamais les pièces."""

    def test_list_admissions_returns_uploaded_documents(self):
        tenant_id = _make_tenant()
        _submit_application_with_documents(tenant_id)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(f"{BASE}/", headers=headers)
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert len(items) == 1
        docs = items[0]["documents"]
        assert docs is not None
        assert len(docs) == 2
        types = {d["document_type"] for d in docs}
        assert types == {"birth_certificate", "id_photo"}

    def test_get_single_admission_returns_uploaded_documents(self):
        tenant_id = _make_tenant()
        app_id = _submit_application_with_documents(tenant_id)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(f"{BASE}/{app_id}/", headers=headers)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["documents"]) == 2

    def test_application_without_documents_has_empty_or_null_documents(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            db.add(AdmissionApplication(
                id=str(uuid.uuid4()), tenant_id=tenant_id,
                student_first_name="Ibrahima", student_last_name="Diallo",
                student_date_of_birth=date(2011, 5, 10), student_gender="M",
                parent_first_name="Fatou", parent_last_name="Diallo",
                parent_email="fatou.diallo@example.com", parent_phone="+224600000002",
                status=AdmissionStatus.SUBMITTED, documents=None,
            ))
            db.commit()

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        items = client.get(f"{BASE}/", headers=headers).json()["items"]
        assert not items[0]["documents"]


class TestDocumentUrlsAreRefreshedAtReadTime:
    """Les URLs sauvegardées à l'upload ne doivent jamais être servies
    telles quelles — elles sont re-signées à chaque lecture."""

    def test_stale_stored_url_is_replaced(self):
        tenant_id = _make_tenant()
        _submit_application_with_documents(tenant_id)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        docs = client.get(f"{BASE}/", headers=headers).json()["items"][0]["documents"]

        for doc in docs:
            assert doc["url"] != "https://old-expired-presigned-url.example/piece1.pdf"
            assert doc["url"] != "https://old-expired-presigned-url.example/piece2.jpg"
            # key/filename/document_type must survive the refresh untouched
            assert doc["key"].startswith(f"admissions/{tenant_id}/")
            assert doc["filename"]
            assert doc["document_type"]
