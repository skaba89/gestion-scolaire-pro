"""app/crud/survey.py — deuxième module migré du DDL brut vers Alembic +
ORM (Horizon 2, suite du pilote clubs) : surveys/survey_questions/
survey_responses étaient absentes de Base.metadata, donc intégralement
non testables jusqu'ici (zéro test préexistant).

Couvre aussi le vrai bug corrigé en migrant : add_survey_response()
stocke désormais response_data comme un blob JSON {question_id: réponse}
par soumission — la forme réelle de la table — au lieu de l'ancien code
qui plantait sur UUID() sans argument avant même d'essayer d'insérer
dans des colonnes qui n'ont jamais existé.
"""
import uuid
from datetime import date

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.crud import survey as crud_survey  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.schemas.survey import (  # noqa: E402
    SurveyAnswer, SurveyCreate, SurveyQuestionCreate, SurveyQuestionUpdate,
    SurveyResponseSubmit, SurveyUpdate,
)


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École CRUD Survey Test", slug=f"crud-survey-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestSurveyCrud:
    def test_create_survey_then_get(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(
                db, SurveyCreate(title="Satisfaction cantine"), tenant_id, created_by=None,
            )
            db.commit()
            survey_id = survey.id

        with SessionLocal() as db:
            fetched = crud_survey.get_survey(db, survey_id, tenant_id)
            assert fetched is not None
            assert fetched.title == "Satisfaction cantine"
            assert fetched.target_audience == "ALL"
            assert fetched.is_active is True

    def test_surveys_scoped_to_tenant(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        with SessionLocal() as db:
            crud_survey.create_survey(db, SurveyCreate(title="Sondage A"), tenant_a, created_by=None)
            crud_survey.create_survey(db, SurveyCreate(title="Sondage B"), tenant_b, created_by=None)
            db.commit()

        with SessionLocal() as db:
            surveys_a = crud_survey.get_surveys(db, tenant_a)
            assert len(surveys_a) == 1
            assert surveys_a[0].title == "Sondage A"

    def test_update_survey_only_touches_provided_fields(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(
                db, SurveyCreate(title="Sondage initial", description="Ancien"), tenant_id, created_by=None,
            )
            db.commit()
            survey_id = survey.id

        with SessionLocal() as db:
            db_obj = crud_survey.get_survey(db, survey_id, tenant_id)
            crud_survey.update_survey(db, db_obj, SurveyUpdate(description="Nouveau"))
            db.commit()

        with SessionLocal() as db:
            fetched = crud_survey.get_survey(db, survey_id, tenant_id)
            assert fetched.title == "Sondage initial"  # inchangé
            assert fetched.description == "Nouveau"

    def test_delete_survey_cascades_questions_and_responses(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(db, SurveyCreate(title="À supprimer"), tenant_id, created_by=None)
            db.commit()
            survey_id = survey.id
            crud_survey.add_question(
                db, survey_id, SurveyQuestionCreate(question_text="Q1"), tenant_id,
            )
            db.commit()
            crud_survey.add_survey_response(
                db, survey, SurveyResponseSubmit(responses=[]), tenant_id, respondent_id=None,
            )
            db.commit()

        with SessionLocal() as db:
            db_obj = crud_survey.get_survey(db, survey_id, tenant_id)
            crud_survey.delete_survey(db, db_obj)
            db.commit()

        with SessionLocal() as db:
            assert crud_survey.get_survey(db, survey_id, tenant_id) is None
            assert crud_survey.get_questions(db, survey_id, tenant_id) == []
            assert crud_survey.get_responses(db, survey_id, tenant_id) == []


class TestSurveyQuestionCrud:
    def test_add_question_auto_increments_order_index(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(db, SurveyCreate(title="S"), tenant_id, created_by=None)
            db.commit()
            survey_id = survey.id

        with SessionLocal() as db:
            q1 = crud_survey.add_question(db, survey_id, SurveyQuestionCreate(question_text="Q1"), tenant_id)
            db.commit()
            q2 = crud_survey.add_question(db, survey_id, SurveyQuestionCreate(question_text="Q2"), tenant_id)
            db.commit()
            assert q1.order_index == 0
            assert q2.order_index == 1

    def test_add_question_respects_explicit_order_index(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(db, SurveyCreate(title="S"), tenant_id, created_by=None)
            db.commit()
            q = crud_survey.add_question(
                db, survey.id, SurveyQuestionCreate(question_text="Q", order_index=5), tenant_id,
            )
            db.commit()
            assert q.order_index == 5

    def test_update_question_partial(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(db, SurveyCreate(title="S"), tenant_id, created_by=None)
            db.commit()
            survey_id = survey.id
            q = crud_survey.add_question(
                db, survey_id, SurveyQuestionCreate(question_text="Ancien texte", is_required=True), tenant_id,
            )
            db.commit()
            question_id = q.id

        with SessionLocal() as db:
            db_obj = crud_survey.get_question(db, survey_id, question_id, tenant_id)
            crud_survey.update_question(db, db_obj, SurveyQuestionUpdate(is_required=False))
            db.commit()

        with SessionLocal() as db:
            fetched = crud_survey.get_question(db, survey_id, question_id, tenant_id)
            assert fetched.question_text == "Ancien texte"  # inchangé
            assert fetched.is_required is False


class TestSurveyResponseSubmission:
    """Le vrai bug corrigé : response_data doit être un blob JSON
    {question_id: réponse}, jamais une colonne question_id/response_text
    inexistante — voir le docstring du module."""

    def test_submitted_response_stores_answers_as_json_blob(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(db, SurveyCreate(title="S", is_anonymous=False), tenant_id, created_by=None)
            db.commit()
            q1 = crud_survey.add_question(db, survey.id, SurveyQuestionCreate(question_text="Q1"), tenant_id)
            db.commit()
            survey_id, q1_id = survey.id, q1.id

        respondent_id = str(uuid.uuid4())
        with SessionLocal() as db:
            survey = crud_survey.get_survey(db, survey_id, tenant_id)
            submission = SurveyResponseSubmit(responses=[SurveyAnswer(question_id=str(q1_id), response="Oui")])
            db_obj = crud_survey.add_survey_response(db, survey, submission, tenant_id, respondent_id=respondent_id)
            db.commit()
            response_id = db_obj.id

        with SessionLocal() as db:
            responses = crud_survey.get_responses(db, survey_id, tenant_id)
            assert len(responses) == 1
            assert responses[0].id == response_id
            assert responses[0].response_data == {str(q1_id): "Oui"}
            assert str(responses[0].respondent_id) == respondent_id

    def test_anonymous_survey_never_records_respondent_id(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            survey = crud_survey.create_survey(db, SurveyCreate(title="S", is_anonymous=True), tenant_id, created_by=None)
            db.commit()
            survey_id = survey.id

        with SessionLocal() as db:
            survey = crud_survey.get_survey(db, survey_id, tenant_id)
            submission = SurveyResponseSubmit(responses=[])
            db_obj = crud_survey.add_survey_response(
                db, survey, submission, tenant_id, respondent_id=str(uuid.uuid4()),
            )
            db.commit()
            assert db_obj.respondent_id is None
