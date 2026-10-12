"""GET /infrastructure/enrollments/ — accès enseignant limité à ses classes.

Régression trouvée par les parcours E2E (2026-10-12) : la garde
`enrollments:read` posée en 2026-09 bloquait les enseignants (qui n'ont pas
cette permission) sur LEURS classes — saisie des notes et présences
impossibles. Un enseignant peut désormais lire les inscriptions d'une
classe à laquelle il est affecté (teacher_assignments), et seulement
celle-là : jamais à l'échelle de l'établissement, jamais sans class_id.
"""
import uuid
from datetime import date

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="teacher_assignments est créée par migration (PostgreSQL).",
)

URL = "/api/v1/infrastructure/enrollments/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user["tenant_id"], "roles": user["roles"]})
    return {"Authorization": f"Bearer {token}"}


def _school() -> dict:
    """Établissement avec deux classes, un étudiant inscrit dans chacune."""
    tag = uuid.uuid4().hex[:8]
    with SessionLocal() as db:
        tenant = Tenant(name=f"École {tag}", slug=f"enr-scope-{tag}", type="university",
                        country="GN", is_active=True, settings={})
        db.add(tenant)
        db.flush()
        year = AcademicYear(tenant_id=tenant.id, name="2024-2025", code=f"Y{tag}",
                            start_date=date(2024, 10, 1), end_date=date(2025, 7, 31))
        db.add(year)
        db.flush()
        ids = {"tenant_id": str(tenant.id)}
        for key in ("mine", "other"):
            classroom = Classroom(tenant_id=tenant.id, name=f"Classe {key} {tag}")
            student = Student(tenant_id=tenant.id, registration_number=f"{key}-{tag}",
                              first_name="Awa", last_name=key, date_of_birth=date(2005, 1, 1),
                              gender="FEMALE")
            db.add_all([classroom, student])
            db.flush()
            db.add(Enrollment(tenant_id=tenant.id, student_id=student.id, class_id=classroom.id,
                              academic_year_id=year.id))
            ids[key] = str(classroom.id)
        db.commit()
    return ids


def _assign(teacher_id: str, tenant_id: str, class_id: str) -> None:
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO teacher_assignments (id, tenant_id, user_id, classroom_id, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :uid, :cid, NOW(), NOW())
        """), {"tid": tenant_id, "uid": teacher_id, "cid": class_id})
        db.commit()


def _user(tenant_id: str, role: str) -> dict:
    """Compte réel (la FK teacher_assignments.user_id l'exige)."""
    with SessionLocal() as db:
        email = f"{role.lower()}.{uuid.uuid4().hex[:8]}@example.com"
        user = User(tenant_id=tenant_id, email=email, username=email, first_name="Test", last_name=role)
        db.add(user)
        db.commit()
        return {"id": str(user.id), "tenant_id": tenant_id, "roles": [role]}


def _teacher(tenant_id: str) -> dict:
    return _user(tenant_id, "TEACHER")


def test_teacher_reads_enrollments_of_an_assigned_class():
    school = _school()
    teacher = _teacher(school["tenant_id"])
    _assign(teacher["id"], school["tenant_id"], school["mine"])

    resp = client.get(URL, params={"class_id": school["mine"]}, headers=_as(teacher))

    assert resp.status_code == 200, resp.text
    assert [e["class_id"] for e in resp.json()] == [school["mine"]]


def test_teacher_is_refused_a_class_they_do_not_teach():
    school = _school()
    teacher = _teacher(school["tenant_id"])
    _assign(teacher["id"], school["tenant_id"], school["mine"])

    resp = client.get(URL, params={"class_id": school["other"]}, headers=_as(teacher))

    assert resp.status_code == 403


def test_teacher_is_refused_the_tenant_wide_list():
    school = _school()
    teacher = _teacher(school["tenant_id"])
    _assign(teacher["id"], school["tenant_id"], school["mine"])

    assert client.get(URL, headers=_as(teacher)).status_code == 403


def test_assignment_in_another_tenant_grants_nothing():
    school_a, school_b = _school(), _school()
    teacher = _teacher(school_a["tenant_id"])
    # Affectation (forgée) sur une classe de B : ne doit rien ouvrir côté A.
    _assign(teacher["id"], school_b["tenant_id"], school_b["mine"])

    resp = client.get(URL, params={"class_id": school_b["mine"]}, headers=_as(teacher))

    assert resp.status_code == 403


def test_non_teacher_without_permission_is_still_refused():
    school = _school()
    student_user = _user(school["tenant_id"], "STUDENT")
    _assign(student_user["id"], school["tenant_id"], school["mine"])  # même avec une ligne parasite

    resp = client.get(URL, params={"class_id": school["mine"]}, headers=_as(student_user))

    assert resp.status_code == 403


def test_admin_keeps_the_tenant_wide_list():
    school = _school()
    admin = {"id": str(uuid.uuid4()), "tenant_id": school["tenant_id"], "roles": ["TENANT_ADMIN"]}

    resp = client.get(URL, headers=_as(admin))

    assert resp.status_code == 200, resp.text
    assert {e["class_id"] for e in resp.json()} == {school["mine"], school["other"]}
