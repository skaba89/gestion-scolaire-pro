"""Tests pour les endpoints surveys — auth guards + le vrai bug corrigé en
migrant vers l'ORM (Horizon 2, suite du pilote clubs) : POST
/surveys/{id}/submit/ appelait UUID() sans argument (TypeError
systématique) et, même sans ce bug, tentait d'insérer dans des colonnes
inexistantes sur la vraie table survey_responses. Soumettre une réponse
à un sondage n'a donc probablement jamais fonctionné — aucun test
n'existait pour ce module avant cette suite."""
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "/api/v1/surveys"


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Surveys Test", slug=f"surveys-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _as_real_user(tenant_id: str, roles: list) -> dict:
    """Like _as(), but backed by a real `users` row — surveys.created_by
    is a real FK to users(id) (see app/models/survey.py), so a synthetic
    JWT-only identity (fine for endpoints with no such FK, e.g. clubs'
    advisor_id which is nullable/never set on create) fails here with a
    FOREIGN KEY constraint violation on create_survey."""
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(
            id=user_id, tenant_id=tenant_id, email=f"{user_id[:8]}@example.com",
            username=f"user-{user_id[:8]}", is_active=True,
        ))
        db.commit()
    return _as({"id": user_id, "roles": roles, "tenant_id": tenant_id})


class TestSurveysAuthGuards:
    def test_list_surveys_requires_auth(self):
        resp = client.get(f"{BASE}/")
        assert resp.status_code in (401, 403)

    def test_create_survey_requires_auth(self):
        resp = client.post(f"{BASE}/", json={"title": "x"})
        assert resp.status_code in (401, 403)

    def test_submit_response_requires_auth(self):
        resp = client.post(f"{BASE}/{uuid.uuid4()}/submit/", json={"responses": []})
        assert resp.status_code in (401, 403)


class TestSurveysCrudEndToEnd:
    def test_create_list_update_delete_survey(self):
        tenant_id = _make_tenant()
        headers = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        created = client.post(f"{BASE}/", json={"title": "Satisfaction cantine", "target_audience": "PARENTS"}, headers=headers)
        assert created.status_code == 201, created.text
        survey = created.json()
        assert survey["title"] == "Satisfaction cantine"
        assert survey["is_active"] is True

        listed = client.get(f"{BASE}/", headers=headers)
        assert listed.status_code == 200
        assert any(s["id"] == survey["id"] for s in listed.json())

        updated = client.patch(f"{BASE}/{survey['id']}/", json={"description": "Nouvelle description"}, headers=headers)
        assert updated.status_code == 200
        assert updated.json()["description"] == "Nouvelle description"
        assert updated.json()["title"] == "Satisfaction cantine"  # inchangé

        deleted = client.delete(f"{BASE}/{survey['id']}/", headers=headers)
        assert deleted.status_code == 200

        after = client.get(f"{BASE}/", headers=headers)
        assert not any(s["id"] == survey["id"] for s in after.json())

    def test_surveys_scoped_to_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()

        headers_a = _as_real_user(tenant_a, ["TENANT_ADMIN"])
        client.post(f"{BASE}/", json={"title": "Sondage A"}, headers=headers_a)

        headers_b = _as_real_user(tenant_b, ["TENANT_ADMIN"])
        resp_b = client.get(f"{BASE}/", headers=headers_b)
        assert resp_b.json() == []


class TestSurveyQuestionsEndToEnd:
    def test_add_list_update_delete_question(self):
        tenant_id = _make_tenant()
        headers = _as_real_user(tenant_id, ["TENANT_ADMIN"])
        survey_id = client.post(f"{BASE}/", json={"title": "S"}, headers=headers).json()["id"]

        added = client.post(f"{BASE}/{survey_id}/questions/", json={
            "question_text": "Êtes-vous satisfait ?", "question_type": "SINGLE_CHOICE",
            "options": ["Oui", "Non"],
        }, headers=headers)
        assert added.status_code == 201, added.text
        question = added.json()
        assert question["order_index"] == 0

        listed = client.get(f"{BASE}/{survey_id}/questions/", headers=headers)
        assert len(listed.json()) == 1

        updated = client.put(f"{BASE}/{survey_id}/questions/{question['id']}/", json={"is_required": False}, headers=headers)
        assert updated.status_code == 200
        assert updated.json()["is_required"] is False
        assert updated.json()["question_text"] == "Êtes-vous satisfait ?"  # inchangé

        deleted = client.delete(f"{BASE}/{survey_id}/questions/{question['id']}/", headers=headers)
        assert deleted.status_code == 200
        assert client.get(f"{BASE}/{survey_id}/questions/", headers=headers).json() == []


class TestSurveySubmissionBugFix:
    """Verrouille explicitement le bug corrigé : soumettre une réponse ne
    doit jamais lever une erreur 400 générique due à UUID() sans argument
    ou à un INSERT sur des colonnes inexistantes."""

    def test_submit_response_succeeds_and_stores_json_blob(self):
        tenant_id = _make_tenant()
        # Setup (create survey + question) needs settings:write; submitting
        # a response doesn't — separate identities to reflect that.
        admin_headers = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        survey_id = client.post(f"{BASE}/", json={"title": "S", "is_active": True}, headers=admin_headers).json()["id"]
        question_id = client.post(f"{BASE}/{survey_id}/questions/", json={
            "question_text": "Q1",
        }, headers=admin_headers).json()["id"]

        headers = _as_real_user(tenant_id, ["STUDENT"])
        submitted = client.post(f"{BASE}/{survey_id}/submit/", json={
            "responses": [{"question_id": question_id, "response": "Ma réponse"}],
        }, headers=headers)
        assert submitted.status_code == 201, submitted.text
        assert submitted.json()["status"] == "success"

        counts = client.get(f"{BASE}/response-counts/", headers=headers)
        assert counts.json().get(survey_id) == 1

    def test_submit_response_rejected_on_inactive_survey(self):
        tenant_id = _make_tenant()
        headers = _as_real_user(tenant_id, ["STUDENT"])
        survey_id = client.post(f"{BASE}/", json={"title": "S", "is_active": False}, headers=headers).json()["id"]

        resp = client.post(f"{BASE}/{survey_id}/submit/", json={"responses": []}, headers=headers)
        assert resp.status_code == 400

    def test_results_aggregate_from_json_blob_correctly(self):
        tenant_id = _make_tenant()
        headers = _as_real_user(tenant_id, ["TENANT_ADMIN"])

        survey_id = client.post(f"{BASE}/", json={"title": "S", "is_active": True}, headers=headers).json()["id"]
        q_id = client.post(f"{BASE}/{survey_id}/questions/", json={
            "question_text": "Note ?", "question_type": "RATING", "options": ["1", "2", "3"],
        }, headers=headers).json()["id"]

        # Deux répondants distincts : total_responses compte les personnes
        # (COUNT DISTINCT respondent_id, hérité de l'intention du code
        # d'origine), pas les lignes de soumission brutes.
        respondent_1 = _as_real_user(tenant_id, ["STUDENT"])
        client.post(f"{BASE}/{survey_id}/submit/", json={
            "responses": [{"question_id": q_id, "response": "3"}],
        }, headers=respondent_1)
        respondent_2 = _as_real_user(tenant_id, ["STUDENT"])
        client.post(f"{BASE}/{survey_id}/submit/", json={
            "responses": [{"question_id": q_id, "response": "3"}],
        }, headers=respondent_2)

        # _as()/_as_real_user() override get_current_user via a single
        # global dependency override, not per-request — re-establish the
        # admin identity right before the call that needs it (see the
        # club memberships tenant-scoping bug this exact pattern caused
        # earlier this session).
        admin_headers = _as_real_user(tenant_id, ["TENANT_ADMIN"])
        results = client.get(f"{BASE}/{survey_id}/results/", headers=admin_headers)
        assert results.status_code == 200, results.text
        body = results.json()
        assert body["total_responses"] == 2
        question_result = body["questions"][0]
        assert question_result["response_count"] == 2
        assert question_result["distribution"] == {"3": 2}
