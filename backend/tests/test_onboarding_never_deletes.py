"""L'assistant de configuration ne supprime jamais rien (2026-11-12).

`POST /tenants/onboarding/subjects/` commençait par
`DELETE FROM subjects WHERE tenant_id = …` : rejouer l'étape « Matières »
de /admin/onboarding effaçait toutes les matières et, par cascade
(assessments.subject_id, grades.assessment_id : ON DELETE CASCADE), toutes
les évaluations et notes de l'établissement. `…/levels/` faisait de même et
répondait 500 dès qu'une classe utilisait un niveau. Trouvé par le parcours
des routes d'écriture en CI (#536).
"""
import uuid
from datetime import date, datetime

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

SUBJECTS = "/api/v1/tenants/onboarding/subjects/"
LEVELS = "/api/v1/tenants/onboarding/levels/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _tenant() -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Onboarding", slug=f"ob-{tid[:8]}", type="secondary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _as(tenant_id: str, roles=("TENANT_ADMIN",)) -> dict:
    user = {"id": str(uuid.uuid4()), "roles": list(roles), "tenant_id": tenant_id}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": user["roles"]})
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


def _count(model, tenant_id: str, **filters) -> int:
    with SessionLocal() as db:
        q = db.query(model).filter(model.tenant_id == tenant_id)
        for k, v in filters.items():
            q = q.filter(getattr(model, k) == v)
        return q.count()


def test_replaying_subjects_step_keeps_subjects_assessments_and_grades():
    tid = _tenant()
    with SessionLocal() as db:
        subject = Subject(id=str(uuid.uuid4()), tenant_id=tid, name="Mathématiques")
        student = Student(id=str(uuid.uuid4()), tenant_id=tid, registration_number=f"R{uuid.uuid4().hex[:8]}",
                          first_name="A", last_name="B", date_of_birth=date(2012, 1, 1),
                          gender=Gender.MALE, status=StudentStatus.ACTIVE)
        db.add_all([subject, student])
        db.flush()
        assessment = Assessment(id=str(uuid.uuid4()), tenant_id=tid, name="Devoir 1", max_score=20.0,
                                date=datetime(2026, 10, 1), subject_id=subject.id)
        db.add(assessment)
        db.flush()
        db.add(Grade(id=str(uuid.uuid4()), tenant_id=tid, student_id=student.id,
                     assessment_id=assessment.id, subject_id=subject.id, score=15.0))
        db.commit()

    resp = client.post(SUBJECTS, json=[{"name": "mathématiques"}, {"name": "Physique"}], headers=_as(tid))
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == ["Physique"]
    assert resp.json()["already_present"] == ["mathématiques"]
    assert _count(Subject, tid) == 2
    assert _count(Assessment, tid) == 1
    assert _count(Grade, tid) == 1


def test_replaying_levels_step_with_classes_is_200_not_500():
    tid = _tenant()
    with SessionLocal() as db:
        level = Level(id=str(uuid.uuid4()), tenant_id=tid, name="6ème", order_index=1)
        db.add(level)
        db.flush()
        db.add(Classroom(id=str(uuid.uuid4()), tenant_id=tid, name="6ème A", level_id=level.id))
        db.commit()

    resp = client.post(LEVELS, json=["6ème", "5ème"], headers=_as(tid))
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == ["5ème"]
    assert _count(Level, tid) == 2
    assert _count(Classroom, tid) == 1


@pytest.mark.parametrize("url,body", [
    (SUBJECTS, []), (SUBJECTS, [{"name": ""}]), (SUBJECTS, [{"name": "Maths", "coefficient": 0}]),
    (LEVELS, []), (LEVELS, ["   "]),
])
def test_malformed_onboarding_body_is_422(url, body):
    resp = client.post(url, json=body, headers=_as(_tenant()))
    assert resp.status_code == 422, resp.text


@pytest.mark.parametrize("url,body", [(SUBJECTS, [{"name": "Maths"}]), (LEVELS, ["6ème"])])
def test_role_without_permission_is_refused(url, body):
    resp = client.post(url, json=body, headers=_as(_tenant(), roles=("TEACHER",)))
    assert resp.status_code == 403, resp.text
