"""Indicateurs fictifs retirés (lot S1, 2026-11-23) : ANALYTICS-MOCK-01, ACADEMIC-STATS-01.

- ``POST /analytics/cash-flow-forecast/`` renvoyait une projection codée en dur (5000, 5200…) : retirée ;
- ``operational-kpis`` : heures d'enseignants toujours 0 (table jugée à tort absente) et taux de
  présence des enseignants toujours 0 % alors qu'aucune donnée ne le mesure ;
- ``gamification/stats`` : « 0 point » et « 0 élève » codés en dur ;
- ``academic-stats`` : une note comptait dans toutes les classes déjà fréquentées par l'élève.

PostgreSQL uniquement (tables créées hors ORM, SQL brut).
"""
import uuid
from datetime import date, timedelta

import pytest
from conftest import get_test_client
from sqlalchemy import text

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.grade import Grade  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql",
                                reason="tables hors ORM et SQL brut : PostgreSQL uniquement")

HEADERS = {"Authorization": "Bearer mock-token"}


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def tenant():
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Indicateurs réels", slug=f"real-{tenant_id[:8]}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
    user = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id, "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    return tenant_id


def _student(tenant_id: str) -> str:
    sid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Student(id=sid, tenant_id=tenant_id, registration_number=f"R-{sid[:8]}", first_name="Mamadou",
                       last_name="Camara", date_of_birth=date(2012, 2, 2), gender=Gender.MALE,
                       status=StudentStatus.ACTIVE))
        db.commit()
    return sid


def test_the_invented_cash_flow_forecast_route_no_longer_exists(tenant):
    assert "/api/v1/analytics/cash-flow-forecast/" not in app.openapi()["paths"]
    response = client.post("/api/v1/analytics/cash-flow-forecast/", json={"months_ahead": 3}, headers=HEADERS)
    assert response.status_code in (404, 405), response.text
    assert "5000" not in response.text and "revenue" not in response.text


def test_operational_kpis_report_real_teacher_hours_and_no_invented_attendance(tenant):
    teacher = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=teacher, tenant_id=tenant, email=f"t-{teacher[:8]}@example.gn", username=f"t-{teacher[:8]}",
                    password_hash="x", first_name="Aminata", last_name="Sow", is_active=True))
        db.commit()
        for hours in (3.5, 2.0):
            db.execute(text(
                "INSERT INTO teacher_work_hours (id, tenant_id, teacher_id, work_date, hours_worked) "
                "VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:uid AS uuid), :d, :h)"
            ), {"id": str(uuid.uuid4()), "tid": tenant, "uid": teacher, "d": date.today() - timedelta(days=2), "h": hours})
        db.commit()

    body = client.get("/api/v1/analytics/operational-kpis/", headers=HEADERS).json()

    assert body["totalTeacherHours"] == 5.5
    assert body["teacherAttendanceRate"] is None  # non mesuré, jamais 0 % inventé


def test_gamification_stats_count_real_students_and_invent_no_points(tenant):
    students = [_student(tenant), _student(tenant)]
    with SessionLocal() as db:
        for sid, name in ((students[0], "Lecture"), (students[0], "Calcul"), (students[1], "Lecture")):
            db.execute(text(
                "INSERT INTO student_badges (id, tenant_id, student_id, badge_type, badge_name) "
                "VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), CAST(:sid AS uuid), 'ACADEMIC', :n)"
            ), {"id": str(uuid.uuid4()), "tid": tenant, "sid": sid, "n": name})
        db.commit()

    body = client.get("/api/v1/school-life/gamification/stats/", headers=HEADERS).json()

    assert body == {"totalPoints": None, "totalAchievements": 3, "totalStudents": 2}


def test_academic_stats_count_a_grade_only_in_the_class_of_its_year(tenant):
    student = _student(tenant)
    with SessionLocal() as db:
        old = AcademicYear(tenant_id=tenant, name="2025", code="2025", start_date=date(2025, 9, 1),
                           end_date=date(2026, 7, 1), is_current=False)
        year = AcademicYear(tenant_id=tenant, name="2026", code="2026", start_date=date(2026, 9, 1),
                            end_date=date(2027, 7, 1), is_current=True)
        db.add_all([old, year])
        db.flush()
        classes = {n: Classroom(tenant_id=tenant, name=n) for n in ("6e A", "5e A", "5e B")}
        db.add_all(classes.values())
        db.flush()
        db.add_all([
            Enrollment(tenant_id=tenant, student_id=student, class_id=classes["6e A"].id,
                       academic_year_id=old.id, status="COMPLETED"),
            Enrollment(tenant_id=tenant, student_id=student, class_id=classes["5e B"].id,
                       academic_year_id=year.id, status="TRANSFERRED"),
            Enrollment(tenant_id=tenant, student_id=student, class_id=classes["5e A"].id,
                       academic_year_id=year.id, status="ACTIVE"),
        ])
        for score in (14.0, 8.0):
            db.add(Grade(tenant_id=tenant, student_id=student, score=score, max_score=20.0,
                         academic_year_id=year.id))
        db.commit()

    body = client.get("/api/v1/analytics/academic-stats/", headers=HEADERS).json()

    assert [(c["class_name"], c["total_students"], c["success_rate"]) for c in body["byClass"]] == [("5e A", 2, 50.0)]
