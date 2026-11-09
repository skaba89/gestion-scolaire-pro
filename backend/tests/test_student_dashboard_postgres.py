"""GET /students/dashboard/ — régression R2 (recette E2E des portails).

La requête d'inscription joignait `levels` sur `e.level_id`, colonne
inexistante : erreur 500 pour tout élève sur PostgreSQL. Elle comparait aussi
le statut à 'active' (stocké 'ACTIVE') et ne filtrait pas l'établissement.
"""
import uuid
from datetime import date, datetime

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.assessment import Assessment  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.student import Gender, Student  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.term import Term  # noqa: E402
from app.models.user import User  # noqa: E402

# Le tableau de bord lit homework/schedule/student_check_ins, tables créées
# par les migrations PostgreSQL uniquement (absentes de la base SQLite).
pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql", reason="Requires real PostgreSQL tables"
)

URL = "/api/v1/students/dashboard/"
HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture
def ctx():
    keys = ["tid", "other_tid", "uid", "other_uid", "sid", "other_sid", "year", "old_year",
            "level", "class_id", "old_class", "other_class", "other_year", "term", "subject"]
    x = {k: str(uuid.uuid4()) for k in keys}
    with SessionLocal() as db:
        for tid in ("tid", "other_tid"):
            db.add(Tenant(id=x[tid], name=f"École {tid}", slug=f"dash-{x[tid][:12]}", type="primary",
                          country="GN", settings={}))
        db.flush()
        for uid, tid in (("uid", "tid"), ("other_uid", "other_tid")):
            db.add(User(id=x[uid], tenant_id=x[tid], email=f"{x[uid]}@example.com", username=x[uid],
                        is_active=True))
        db.add(AcademicYear(id=x["year"], tenant_id=x["tid"], name="2026-2027", code=f"Y-{x['year'][:6]}",
                            start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_current=True))
        db.add(AcademicYear(id=x["old_year"], tenant_id=x["tid"], name="2025-2026", code=f"O-{x['old_year'][:6]}",
                            start_date=date(2025, 9, 1), end_date=date(2026, 6, 30), is_current=False))
        db.add(AcademicYear(id=x["other_year"], tenant_id=x["other_tid"], name="2026-2027",
                            code=f"X-{x['other_year'][:6]}", start_date=date(2026, 9, 1),
                            end_date=date(2027, 6, 30), is_current=True))
        db.add(Level(id=x["level"], tenant_id=x["tid"], name="7e Année", order_index=1))
        db.flush()
        db.add(Classroom(id=x["class_id"], tenant_id=x["tid"], academic_year_id=x["year"],
                         level_id=x["level"], name="7e A"))
        db.add(Classroom(id=x["old_class"], tenant_id=x["tid"], academic_year_id=x["old_year"], name="6e A"))
        db.add(Classroom(id=x["other_class"], tenant_id=x["other_tid"], academic_year_id=x["other_year"],
                         name="Classe autre école"))
        db.add(Term(id=x["term"], tenant_id=x["tid"], academic_year_id=x["year"], name="Trimestre 1",
                    start_date=date(2026, 9, 1), end_date=date(2026, 12, 20), sequence_number=1))
        db.add(Subject(id=x["subject"], tenant_id=x["tid"], name="Mathématiques", coefficient=2))
        for sid, tid, uid, last in (("sid", "tid", "uid", "Camara"), ("other_sid", "other_tid", "other_uid", "Bah")):
            db.add(Student(id=x[sid], tenant_id=x[tid], user_id=x[uid], registration_number=f"DASH-{x[sid][:12]}",
                           first_name="Élève", last_name=last, date_of_birth=date(2013, 5, 2),
                           gender=Gender.FEMALE))
        db.flush()
        # Inscription ancienne d'abord (plus ancienne en base), puis l'actuelle.
        db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x["sid"],
                          class_id=x["old_class"], academic_year_id=x["old_year"], status="ACTIVE"))
        db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x["sid"],
                          class_id=x["class_id"], academic_year_id=x["year"], status="ACTIVE"))
        db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=x["other_tid"], student_id=x["other_sid"],
                          class_id=x["other_class"], academic_year_id=x["other_year"], status="ACTIVE"))
        aid = str(uuid.uuid4())
        db.add(Assessment(id=aid, tenant_id=x["tid"], name="Composition", subject_id=x["subject"],
                          term_id=x["term"], academic_year_id=x["year"], class_id=x["class_id"],
                          date=datetime(2026, 10, 1), max_score=20, weight=1))
        db.flush()
        db.add(Grade(id=str(uuid.uuid4()), tenant_id=x["tid"], student_id=x["sid"], assessment_id=aid,
                     subject_id=x["subject"], score=14, max_score=20, coefficient=1))
        db.commit()
    yield x
    app.dependency_overrides.pop(get_current_user, None)


def _as(x, uid="uid", tid="tid"):
    user = {"id": x[uid], "tenant_id": x[tid], "roles": ["STUDENT"], "email": f"{x[uid]}@example.com"}
    app.dependency_overrides[get_current_user] = lambda: user
    return client.get(URL, headers=HEADERS)


def test_dashboard_returns_current_enrollment_with_class_and_level(ctx):
    response = _as(ctx)
    assert response.status_code == 200, response.text
    body = response.json()
    enrollment = body["enrollment"]
    assert enrollment is not None, "inscription ACTIVE non trouvée (statut comparé en minuscules ?)"
    assert enrollment["class_name"] == "7e A"
    assert enrollment["level_name"] == "7e Année"
    assert [g["score"] for g in body["grades"]] == [14]
    assert body["grades"][0]["assessments"]["subjects"]["name"] == "Mathématiques"


def test_dashboard_never_returns_another_school_enrollment(ctx):
    mine = _as(ctx).json()
    other = _as(ctx, uid="other_uid", tid="other_tid").json()
    assert other["enrollment"]["class_name"] == "Classe autre école"
    assert mine["enrollment"]["class_name"] != "Classe autre école"
    assert other["grades"] == []


def test_dashboard_without_active_enrollment_is_not_an_error(ctx):
    with SessionLocal() as db:
        db.query(Enrollment).filter(Enrollment.student_id == ctx["sid"]).update({"status": "WITHDRAWN"})
        db.commit()
    response = _as(ctx)
    assert response.status_code == 200, response.text
    assert response.json()["enrollment"] is None
