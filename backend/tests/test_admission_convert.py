"""POST /admissions/{id}/convert/ — BUG RÉEL reproduit en production
(capture d'écran à l'appui, 422 systématique) : ConvertPayload a tous
ses champs individuellement optionnels, mais le paramètre `payload`
lui-même n'avait pas de valeur par défaut — FastAPI exige alors un
corps de requête présent (au moins {}) pour construire le modèle. Le
frontend appelait `apiClient.post(url)` sans second argument (aucun
corps envoyé), donc le clic "Inscrire" échouait à 100% avec un 422,
avant même d'atteindre le code de conversion.

Corrigé des deux côtés : `payload: ConvertPayload = ConvertPayload()`
ici (défensif, quel que soit l'appelant), et le frontend envoie
désormais {} explicitement (src/queries/admissions.ts::useConvertAdmission).

Ces tests verrouillent spécifiquement la couche de VALIDATION FastAPI
(le 422 vient de Pydantic, avant tout code métier) — le reste de
convert_to_student() utilise INSERT ... NOW() dans son SQL brut
(Postgres uniquement, comme public_apply()/transition_status()), donc
jamais exécutable jusqu'au bout sur SQLite. Ce module n'avait aucun
test avant cette suite. Le test qui va jusqu'au bout
(test_convert_end_to_end_ORM_path_marks_application_converted) évite ce
SQL brut en appelant directement app.crud... — non, il n'existe pas de
couche CRUD ici (module non migré) : on se contente donc de prouver que
la requête n'échoue PLUS à la validation (422), quel que soit le sort
ultérieur du SQL Postgres-only sur SQLite.
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
            id=tenant_id, name="École Convert Test", slug=f"admission-convert-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_accepted_application(tenant_id: str) -> str:
    app_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AdmissionApplication(
            id=app_id, tenant_id=tenant_id,
            student_first_name="Cheick", student_last_name="Keita",
            student_date_of_birth=date(2006, 1, 12), student_gender="M",
            parent_first_name="Mory", parent_last_name="Kaba",
            parent_email="mory.kaba@example.com", parent_phone="+224600000002",
            status=AdmissionStatus.ACCEPTED,
        ))
        db.commit()
    return app_id


class TestConvertRequestValidationNeverRejectsAMissingBody:
    """Le vrai bug est ici : un corps de requête absent/vide ne doit
    JAMAIS produire un 422 (erreur de validation Pydantic), puisque tous
    les champs de ConvertPayload sont déjà optionnels. Le SQL brut de
    convert_to_student() (INSERT ... NOW()) est Postgres-only et ne peut
    pas s'exécuter jusqu'au bout sur SQLite (voir docstring du module) —
    ces tests acceptent donc un 500 côté SQLite (échec plus loin, dans
    le SQL) mais jamais un 422 (qui prouverait que le vrai bug signalé
    est revenu)."""

    def test_no_body_at_all_never_returns_422(self):
        # Reproduit EXACTEMENT l'appel cassé avant correctif :
        # apiClient.post(url) côté frontend, sans second argument.
        tenant_id = _make_tenant()
        app_id = _make_accepted_application(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/{app_id}/convert/", headers=headers)
        assert resp.status_code != 422, resp.text

    def test_empty_json_body_never_returns_422(self):
        # Le comportement corrigé côté frontend (envoie {} explicitement).
        tenant_id = _make_tenant()
        app_id = _make_accepted_application(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/{app_id}/convert/", json={}, headers=headers)
        assert resp.status_code != 422, resp.text

    def test_explicit_fields_still_accepted(self):
        tenant_id = _make_tenant()
        app_id = _make_accepted_application(tenant_id)
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(
            f"{BASE}/{app_id}/convert/",
            json={"registration_number": "STU-2026-0099", "class_name": "6eme A"},
            headers=headers,
        )
        assert resp.status_code != 422, resp.text

    def test_convert_still_enforces_accepted_status_before_touching_the_body(self):
        # Le contrôle métier (status == ACCEPTED) doit continuer à
        # s'exécuter et rejeter proprement (400), pas être court-circuité
        # par le nouveau défaut de payload.
        tenant_id = _make_tenant()
        app_id = str(uuid.uuid4())
        with SessionLocal() as db:
            db.add(AdmissionApplication(
                id=app_id, tenant_id=tenant_id,
                student_first_name="X", student_last_name="Y",
                parent_first_name="P", parent_last_name="Q",
                parent_email="p@example.com", parent_phone="+224600000003",
                status=AdmissionStatus.SUBMITTED,
            ))
            db.commit()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})

        resp = client.post(f"{BASE}/{app_id}/convert/", headers=headers)
        assert resp.status_code == 400
