"""SEARCH-STUDENTS-01 et COUNTS-STATUS-01.

1. GET /api/v1/search/ cherchait les élèves dans une colonne ``student_number``
   qui n'existe pas (``registration_number``) : la recherche d'élèves échouait
   pour tout compte non restreint, et l'échec avortait la transaction
   PostgreSQL, faisant échouer les types suivants. Corriger la colonne sans
   contrôle de rôle aurait ouvert la recherche dans tous les élèves de
   l'établissement aux élèves et aux parents : le type est réservé au personnel.
2. GET /api/v1/infrastructure/enrollments/counts/ comparait ``status = 'active'``
   alors que le statut est stocké ``ACTIVE`` : effectifs toujours vides.
"""
import datetime
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.api.v1.endpoints.core import search as search_module  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.academic_year import AcademicYear  # noqa: E402
from app.models.classroom import Classroom  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.student import Gender, Student, StudentStatus  # noqa: E402
from app.models.subject import Subject  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")
# Le SQL brut de la recherche (``id::text``, ILIKE) et des compteurs
# (``ANY(:class_ids)``) est propre à PostgreSQL.
needs_postgres = pytest.mark.skipif(IS_SQLITE, reason="SQL brut PostgreSQL")

HEADERS = {"Authorization": "Bearer mock-token"}
SEARCH = "/api/v1/search/"
COUNTS = "/api/v1/infrastructure/enrollments/counts/"
COUNTS_ALIAS = "/api/v1/enrollments/counts/"


@pytest.fixture(autouse=True)
def _clear_overrides():
    # La recherche est limitée à 30 requêtes/minute : sans remise à zéro, les
    # fichiers de recherche enchaînés dans la suite reçoivent 429.
    search_module.limiter.reset()
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(roles, tenant_id):
    app.dependency_overrides[get_current_user] = lambda: {
        "id": str(uuid.uuid4()), "roles": roles, "tenant_id": tenant_id, "_cycle_ids": None,
    }
    return client


@pytest.fixture
def school():
    tenant_id, ay_id = str(uuid.uuid4()), str(uuid.uuid4())
    class_a, class_b = str(uuid.uuid4()), str(uuid.uuid4())
    marker = uuid.uuid4().hex[:8]
    students = [str(uuid.uuid4()) for _ in range(4)]
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Recherche", slug=f"srch-{tenant_id[:8]}",
                      type="primary", country="GN", is_active=True, settings={}))
        db.commit()
        db.add(AcademicYear(id=ay_id, tenant_id=tenant_id, name="2026-2027", code=f"Y-{marker}",
                            start_date=datetime.date(2026, 9, 1), end_date=datetime.date(2027, 7, 1),
                            is_current=True))
        db.add(Classroom(id=class_a, tenant_id=tenant_id, name="CP A"))
        db.add(Classroom(id=class_b, tenant_id=tenant_id, name="CP B"))
        db.add(Subject(id=str(uuid.uuid4()), tenant_id=tenant_id, name=f"Zoologie{marker}",
                       code=f"Z{marker[:5]}"))
        for index, student_id in enumerate(students):
            db.add(Student(
                id=student_id, tenant_id=tenant_id, first_name=f"Mariama{marker}", last_name="Sow",
                registration_number=f"MAT-{marker}-{index}", status=StudentStatus.ACTIVE,
                date_of_birth=datetime.date(2019, 1, 1), gender=Gender.FEMALE,
            ))
        db.commit()
        # Classe A : 2 actives (dont une en minuscules) + 1 retirée ; classe B : 1 active.
        for student_id, class_id, status in (
            (students[0], class_a, "ACTIVE"), (students[1], class_a, "active"),
            (students[2], class_a, "WITHDRAWN"), (students[3], class_b, "ACTIVE"),
        ):
            db.add(Enrollment(id=str(uuid.uuid4()), tenant_id=tenant_id, student_id=student_id,
                              class_id=class_id, academic_year_id=ay_id, status=status))
        db.commit()
    return {"tenant": tenant_id, "class_a": class_a, "class_b": class_b, "marker": marker}


# ── Recherche d'élèves ─────────────────────────────────────────────────────────

@needs_postgres
@pytest.mark.parametrize("role", ["TENANT_ADMIN", "SECRETARY", "TEACHER"])
def test_staff_finds_students_by_name_and_registration_number(school, role):
    tenant, marker = school["tenant"], school["marker"]
    for query in (f"Mariama{marker}", f"MAT-{marker}-0"):
        resp = _as([role], tenant).get(SEARCH, params={"q": query, "types": "students"}, headers=HEADERS)
        assert resp.status_code == 200, resp.text
        block = resp.json()["results"]["students"]
        assert "error" not in block, block
        assert block["count"] >= 1
        assert any(item["subtitle"].startswith(f"MAT-{marker}") for item in block["items"])


@needs_postgres
def test_other_types_still_answer_alongside_students(school):
    """Avant le correctif, l'échec du type ``students`` avortait la transaction
    PostgreSQL : les types suivants répondaient « Recherche indisponible »."""
    tenant, marker = school["tenant"], school["marker"]
    resp = _as(["TENANT_ADMIN"], tenant).get(
        SEARCH, params={"q": f"Zoologie{marker}", "types": "students,subjects"}, headers=HEADERS)
    assert resp.status_code == 200, resp.text
    results = resp.json()["results"]
    assert "error" not in results["students"]
    assert "error" not in results["subjects"]
    assert results["subjects"]["count"] == 1


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "ALUMNI"])
def test_families_cannot_search_students_alone(school, role):
    resp = _as([role], school["tenant"]).get(
        SEARCH, params={"q": f"Mariama{school['marker']}", "types": "students"}, headers=HEADERS)
    assert resp.status_code == 403


@pytest.mark.parametrize("role", ["STUDENT", "PARENT", "ALUMNI"])
def test_families_never_get_students_in_mixed_search(school, role):
    resp = _as([role], school["tenant"]).get(
        SEARCH, params={"q": f"Mariama{school['marker']}", "types": "students,subjects"}, headers=HEADERS)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "students" not in body["types_searched"]
    assert "students" not in body["results"]
    assert f"MAT-{school['marker']}" not in resp.text


def test_default_search_of_a_parent_excludes_students(school):
    resp = _as(["PARENT"], school["tenant"]).get(
        SEARCH, params={"q": f"Mariama{school['marker']}"}, headers=HEADERS)
    assert resp.status_code == 200, resp.text
    assert "students" not in resp.json()["types_searched"]
    assert f"MAT-{school['marker']}" not in resp.text


# ── Effectifs par classe ───────────────────────────────────────────────────────

@needs_postgres
@pytest.mark.parametrize("url", [COUNTS, COUNTS_ALIAS])
def test_enrollment_counts_count_active_enrollments_whatever_their_case(school, url):
    resp = _as(["TENANT_ADMIN"], school["tenant"]).get(
        url, params=[("class_ids", school["class_a"]), ("class_ids", school["class_b"])], headers=HEADERS)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {school["class_a"]: 2, school["class_b"]: 1}
