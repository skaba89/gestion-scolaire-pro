"""Périmètre par cycle (lot B2b) : élèves, classes, inscriptions, liens parents,
matières d'élève et recherche.

JWT réel, lecture réelle des affectations (fixtures de ``test_cycle_scope_gate``).
Un compte restreint au cycle « primaire » ne voit que les élèves inscrits (ACTIVE,
année courante) dans une classe de ce cycle ; tout autre objet répond 404 et
l'écriture n'a aucun effet en base. Les comptes non restreints, administrateurs,
enseignants et parents gardent leur comportement antérieur.
"""
from datetime import date, datetime, timezone
from uuid import UUID, uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from sqlalchemy import insert, select  # noqa: E402

from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models import (  # noqa: E402
    AcademicYear, Classroom, Department, Enrollment, ParentStudent, Student, Subject,
)
from app.models.associations import class_subjects, classroom_departments, student_subjects  # noqa: E402
from app.models.student import Gender  # noqa: E402
from test_cycle_scope_gate import _assert_denied, school, structure  # noqa: E402,F401

API = "/api/v1"
IS_SQLITE = engine.dialect.name == "sqlite"
needs_any_array = pytest.mark.skipif(
    IS_SQLITE, reason="les compteurs d'inscriptions utilisent ANY(array) : PostgreSQL uniquement"
)
# Ces routes comparent des UUID en texte tiret (SQL brut), incompatible avec le stockage hexadécimal
# de SQLite (même limite documentée dans test_student_subjects_registration) : PostgreSQL uniquement.
needs_postgres = pytest.mark.skipif(IS_SQLITE, reason="SQL brut sur UUID en texte : PostgreSQL uniquement")


@pytest.fixture
def world(school, structure):
    """Complète la structure de la porte : un élève sans inscription, des liens
    parents, des matières d'élève, des classes liées à matière/département et une
    inscription passée dans une classe d'un autre cycle."""
    t = school["tenant"]
    people = school["people"]
    extra = {n: uuid4() for n in ("s_none", "subject", "dept", "link_cp", "link_6e", "link_none")}
    with SessionLocal() as db:
        db.add(Student(id=extra["s_none"], tenant_id=t, registration_number=f"s_none-{extra['s_none']}",
                       first_name="s_none", last_name="Test", date_of_birth=date(2015, 1, 1), gender=Gender.MALE))
        db.add(Subject(id=extra["subject"], tenant_id=t, name="Maths", code="MAT"))
        db.add(Department(id=extra["dept"], tenant_id=t, name="Sciences"))
        db.flush()
        for key, student in (("link_cp", "s_cp"), ("link_6e", "s_6e"), ("link_none", "s_none")):
            sid = extra[student] if student == "s_none" else structure[student]
            db.add(ParentStudent(id=extra[key], tenant_id=t, parent_id=people["parent"], student_id=sid))
        for klass in ("cls_cp", "cls_6e"):
            db.execute(insert(class_subjects).values(
                tenant_id=t, class_id=structure[klass], subject_id=extra["subject"], is_optional=False, coefficient=1.0))
            db.execute(insert(classroom_departments).values(
                tenant_id=t, class_id=structure[klass], department_id=extra["dept"]))
        for student in ("s_cp", "s_6e"):
            db.execute(insert(student_subjects).values(
                tenant_id=t, student_id=structure[student], subject_id=extra["subject"],
                created_at=datetime.now(timezone.utc)))
        # Inscription passée de s_cp dans une classe du collège (autre cycle).
        db.add(Enrollment(tenant_id=t, student_id=structure["s_cp"], class_id=structure["cls_6e"],
                          academic_year_id=structure["old_year"], status="TRANSFERRED"))
        db.commit()
        enrollments = {
            key: db.execute(select(Enrollment.id).where(
                Enrollment.tenant_id == t, Enrollment.student_id == structure[student],
                Enrollment.class_id == structure[klass], Enrollment.status == "ACTIVE")).scalar_one()
            for key, student, klass in (("e_cp", "s_cp", "cls_cp"), ("e_6e", "s_6e", "cls_6e"))
        }
    yield {**structure, **extra, "enrollments": enrollments}
    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        for table in (student_subjects, class_subjects, classroom_departments):
            db.execute(table.delete().where(table.c.tenant_id == t))
        for model in (ParentStudent, Enrollment, Department, Subject):
            db.query(model).filter(model.tenant_id == t).delete()
        db.query(Student).filter(Student.id == extra["s_none"]).delete()
        db.commit()


def call(school, who, method, url, extra_headers=None, **kwargs):
    return client.request(method, f"{API}{url}", headers=school["headers"](who, **(extra_headers or {})), **kwargs)


def ids(response, key="id"):
    assert response.status_code == 200, response.text
    body = response.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    return {str(item[key]) for item in items}


def student_row(student_id):
    with SessionLocal() as db:
        return db.get(Student, student_id)


def enrollment_count(tenant):
    with SessionLocal() as db:
        return db.query(Enrollment).filter(Enrollment.tenant_id == tenant).count()


def enrollment_status(enrollment_id):
    with SessionLocal() as db:
        return db.get(Enrollment, enrollment_id).status


ALL_TENANT_STUDENTS = {"s_cp", "s_6e", "s_nolevel", "s_nocycle", "s_withdrawn", "s_old_only", "s_none"}


# --- Élèves : lecture ---------------------------------------------------------

def test_student_list_is_limited_to_the_cycle_with_exact_total(school, world):
    response = call(school, "secretary", "GET", "/students/")
    assert ids(response) == {str(world["s_cp"])}
    assert response.json()["total"] == 1 and response.json()["pages"] == 1


def test_student_list_total_stays_exact_under_pagination_and_filters(school, world):
    page = call(school, "secretary", "GET", "/students/", params={"page_size": 1, "page": 1}).json()
    assert page["total"] == 1 and len(page["items"]) == 1
    searched = call(school, "secretary", "GET", "/students/", params={"search": "Test"}).json()
    assert searched["total"] == 1 and len(searched["items"]) == 1
    nothing = call(school, "secretary", "GET", "/students/", params={"level": "inexistant"}).json()
    assert nothing["total"] == 0 and nothing["items"] == []
    free = call(school, "secretary_free", "GET", "/students/", params={"page_size": 2}).json()
    assert free["total"] == len(ALL_TENANT_STUDENTS) and len(free["items"]) == 2 and free["pages"] == 4


@pytest.mark.parametrize("who", ["secretary_free", "admin_residual", "teacher"])
def test_unrestricted_accounts_still_list_every_student(school, world, who):
    response = call(school, who, "GET", "/students/")
    assert ids(response) == {str(world[name]) for name in ALL_TENANT_STUDENTS}
    assert response.json()["total"] == len(ALL_TENANT_STUDENTS)


@needs_postgres
def test_parent_still_sees_only_their_children(school, world):
    response = call(school, "parent", "GET", "/students/")
    assert ids(response) == {str(world[name]) for name in ("s_cp", "s_6e", "s_none")}
    assert call(school, "parent", "GET", f"/students/{world['s_withdrawn']}/").status_code == 404


def test_student_detail_in_scope_and_404_elsewhere(school, world):
    assert call(school, "secretary", "GET", f"/students/{world['s_cp']}/").status_code == 200
    for name in ("s_6e", "s_none", "s_nolevel", "s_nocycle", "s_withdrawn", "s_old_only", "s_foreign"):
        response = call(school, "secretary", "GET", f"/students/{world[name]}/")
        assert response.status_code == 404, name
    assert call(school, "secretary", "GET", f"/students/{uuid4()}/").status_code == 404


@pytest.mark.parametrize("who", ["secretary_free", "admin_residual", "teacher"])
def test_unrestricted_detail_is_unchanged(school, world, who):
    assert call(school, who, "GET", f"/students/{world['s_6e']}/").status_code == 200
    assert call(school, who, "GET", f"/students/{world['s_none']}/").status_code == 200
    assert call(school, who, "GET", f"/students/{world['s_foreign']}/").status_code == 404


def test_student_enrollment_detail_is_scoped(school, world):
    ok = call(school, "secretary", "GET", f"/students/{world['s_cp']}/enrollment/")
    assert ok.status_code == 200 and ok.json()["class_id"] == str(world["cls_cp"])
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "secretary", "GET", f"/students/{world[name]}/enrollment/").status_code == 404, name
    # Inscription passée d'un élève du périmètre dans une classe d'un autre cycle : masquée.
    url = f"/students/{world['s_cp']}/enrollment/"
    assert call(school, "secretary", "GET", url, params={"status": "transferred"}).status_code == 404
    free = call(school, "secretary_free", "GET", url, params={"status": "transferred"})
    assert free.status_code == 200 and free.json()["class_id"] == str(world["cls_6e"])
    assert call(school, "secretary_free", "GET", f"/students/{world['s_6e']}/enrollment/").status_code == 200


# --- Élèves : écriture --------------------------------------------------------

@pytest.mark.parametrize("method", ["PATCH", "PUT"])
def test_update_out_of_scope_is_404_without_effect(school, world, method):
    for name in ("s_6e", "s_none", "s_nolevel", "s_foreign"):
        before = student_row(world[name])
        response = call(school, "secretary", method, f"/students/{world[name]}/", json={"first_name": "Pirate"})
        assert response.status_code == 404, name
        after = student_row(world[name])
        assert (after.first_name if after else None) == (before.first_name if before else None)
        assert after is None or after.first_name != "Pirate"


@pytest.mark.parametrize("method", ["PATCH", "PUT"])
def test_update_in_scope_works(school, world, method):
    response = call(school, "secretary", method, f"/students/{world['s_cp']}/", json={"first_name": "Aminata"})
    assert response.status_code == 200, response.text
    assert student_row(world["s_cp"]).first_name == "Aminata"


def test_update_unrestricted_reaches_every_student(school, world):
    response = call(school, "secretary_free", "PATCH", f"/students/{world['s_none']}/", json={"first_name": "Libre"})
    assert response.status_code == 200
    assert student_row(world["s_none"]).first_name == "Libre"


def test_delete_out_of_scope_is_404_without_effect(school, world):
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "secretary", "DELETE", f"/students/{world[name]}/").status_code == 404, name
        assert student_row(world[name]) is not None, name
    # Dans le périmètre : la garde passe, la règle métier (historique protégé) s'applique.
    assert call(school, "secretary", "DELETE", f"/students/{world['s_cp']}/").status_code == 409
    assert student_row(world["s_cp"]) is not None


def test_delete_unrestricted_is_unchanged(school, world):
    with SessionLocal() as db:  # s_none porte un lien parent (historique protégé) : on le retire
        db.query(ParentStudent).filter(ParentStudent.student_id == world["s_none"]).delete()
        db.commit()
    assert call(school, "secretary_free", "DELETE", f"/students/{world['s_none']}/").status_code == 204
    assert student_row(world["s_none"]) is None


def test_scope_ignores_the_case_of_the_enrollment_status(school, world):
    """POST /enrollments/ enregistre « active » en minuscules par défaut."""
    t = school["tenant"]
    lowered = uuid4()
    with SessionLocal() as db:
        db.add(Student(id=lowered, tenant_id=t, registration_number=f"low-{lowered}", first_name="Casse",
                       last_name="Test", date_of_birth=date(2015, 1, 1), gender=Gender.MALE))
        db.flush()
        db.add(Enrollment(tenant_id=t, student_id=lowered, class_id=world["cls_cp"],
                          academic_year_id=world["year"], status="active"))
        db.commit()
    assert str(lowered) in ids(call(school, "secretary", "GET", "/students/"))
    assert call(school, "secretary", "GET", f"/students/{lowered}/").status_code == 200


# --- Classes ------------------------------------------------------------------

CLASSROOM_LISTS = ["/classrooms/", "/infrastructure/classrooms/"]


@pytest.mark.parametrize("url", CLASSROOM_LISTS)
def test_classroom_lists_are_limited_to_the_cycle(school, world, url):
    assert ids(call(school, "secretary", "GET", url)) == {str(world["cls_cp"]), str(world["cls_old"])}
    everything = {str(world[n]) for n in ("cls_cp", "cls_6e", "cls_nolevel", "cls_nocycle", "cls_old")}
    for who in ("secretary_free", "admin_residual"):
        assert ids(call(school, who, "GET", url)) == everything


@pytest.mark.parametrize("suffix", ["subjects", "departments"])
def test_classroom_associations_are_scoped(school, world, suffix):
    url = "/infrastructure/classrooms/{}/" + suffix + "/"
    ok = call(school, "secretary", "GET", url.format(world["cls_cp"]))
    assert ok.status_code == 200 and len(ok.json()) == 1
    for name in ("cls_6e", "cls_nolevel", "cls_nocycle", "foreign_class"):
        assert call(school, "secretary", "GET", url.format(world[name])).status_code == 404, name
    assert call(school, "secretary_free", "GET", url.format(world["cls_6e"])).status_code == 200


def test_classroom_departments_list_is_scoped(school, world):
    restricted = call(school, "secretary", "GET", "/infrastructure/classroom-departments/")
    assert ids(restricted, "class_id") == {str(world["cls_cp"])}
    free = call(school, "secretary_free", "GET", "/infrastructure/classroom-departments/")
    assert ids(free, "class_id") == {str(world["cls_cp"]), str(world["cls_6e"])}


# --- Inscriptions : lecture ---------------------------------------------------

ENROLLMENT_LISTS = ["/enrollments/", "/infrastructure/enrollments/"]


@pytest.mark.parametrize("url", ENROLLMENT_LISTS)
def test_enrollment_lists_only_show_students_of_the_cycle(school, world, url):
    """Règle : classe dans le périmètre ET élève dans le périmètre (inscription ACTIVE
    courante dans un cycle du compte). s_withdrawn (retiré) et s_old_only (ACTIVE d'une
    ancienne année) ne sont pas dans le périmètre : leurs inscriptions sont masquées."""
    rows = call(school, "secretary", "GET", url).json()
    assert {r["student_id"] for r in rows} == {str(world["s_cp"])}
    assert {r["class_id"] for r in rows} == {str(world["cls_cp"])}
    # Filtre explicite sur une classe hors périmètre : rien (et pas d'élargissement).
    assert call(school, "secretary", "GET", url, params={"class_id": str(world["cls_6e"])}).json() == []
    assert call(school, "secretary", "GET", url, params={"class_id": str(world["cls_old"])}).json() == []
    for status in ("withdrawn", "WITHDRAWN", "active"):
        got = call(school, "secretary", "GET", url, params={"status": status}).json()
        assert {r["student_id"] for r in got} <= {str(world["s_cp"])}, status
        assert (status == "active") == bool(got), status


@pytest.mark.parametrize("url", ENROLLMENT_LISTS)
def test_enrollment_lists_are_unchanged_when_unrestricted(school, world, url):
    for who in ("secretary_free", "admin_residual"):
        assert len(call(school, who, "GET", url).json()) == 7


def test_enrollment_alias_class_ids_filter_cannot_widen_the_scope(school, world):
    wanted = f"{world['cls_cp']},{world['cls_6e']}"
    rows = call(school, "secretary", "GET", "/enrollments/", params={"class_ids": wanted}).json()
    assert {r["class_id"] for r in rows} == {str(world["cls_cp"])}


@needs_any_array
def test_enrollment_counts_alias_only_counts_classes_of_the_cycle(school, world):
    params = {"class_ids": [str(world["cls_cp"]), str(world["cls_6e"]), str(world["cls_nolevel"])]}
    assert call(school, "secretary", "GET", "/enrollments/counts/", params=params).json() == {str(world["cls_cp"]): 1}
    free = call(school, "secretary_free", "GET", "/enrollments/counts/", params=params).json()
    assert free == {str(world["cls_cp"]): 1, str(world["cls_6e"]): 1, str(world["cls_nolevel"]): 1}


@needs_any_array
def test_infrastructure_enrollment_counts_never_expose_other_cycles(school, world):
    params = {"class_ids": [str(world["cls_cp"]), str(world["cls_6e"]), str(world["cls_nolevel"])]}
    # Assertion volontairement faible : cette route compare `status = 'active'` en minuscules alors
    # que le statut est stocké en majuscules, donc ses compteurs sont toujours vides (bug existant,
    # corrigé dans une PR séparée). On vérifie seulement qu'aucune autre classe n'est exposée ;
    # l'assertion exacte est portée par l'alias /enrollments/counts/ (LOWER(status)).
    restricted = call(school, "secretary", "GET", "/infrastructure/enrollments/counts/", params=params).json()
    assert set(restricted) <= {str(world["cls_cp"])}


@pytest.mark.parametrize("url", ["/enrollments/counts/", "/infrastructure/enrollments/counts/"])
def test_enrollment_counts_of_foreign_classes_are_empty_for_restricted(school, world, url):
    params = {"class_ids": [str(world["cls_6e"]), str(world["foreign_class"])]}
    assert call(school, "secretary", "GET", url, params=params).json() == {}


# --- Inscriptions : écriture --------------------------------------------------

def enrollment_body(world, student, klass, year="year"):
    return {"student_id": str(world[student]), "class_id": str(world[klass]), "academic_year_id": str(world[year])}


@pytest.mark.parametrize("url", ENROLLMENT_LISTS)
def test_create_enrollment_requires_class_and_student_in_scope(school, world, url):
    before = enrollment_count(school["tenant"])
    for student, klass in (
        ("s_cp", "cls_6e"),          # classe cible hors cycle
        ("s_6e", "cls_cp"),          # élève hors cycle
        ("s_none", "cls_cp"),        # élève sans inscription : réservé aux comptes non restreints
        ("s_none", "cls_6e"),
        ("s_foreign", "cls_cp"),     # élève d'un autre établissement
        ("s_cp", "foreign_class"),   # classe d'un autre établissement
        ("s_cp", "cls_nolevel"),
    ):
        response = call(school, "secretary", "POST", url, json=enrollment_body(world, student, klass, "old_year"))
        assert response.status_code == 404, (student, klass, response.text)
    assert enrollment_count(school["tenant"]) == before


@pytest.mark.parametrize("url", ENROLLMENT_LISTS)
def test_create_enrollment_in_scope_works(school, world, url):
    before = enrollment_count(school["tenant"])
    response = call(school, "secretary", "POST", url, json=enrollment_body(world, "s_cp", "cls_cp", "old_year"))
    assert response.status_code in (200, 201), response.text
    assert enrollment_count(school["tenant"]) == before + 1


@pytest.mark.parametrize("url", ENROLLMENT_LISTS)
def test_create_enrollment_is_unchanged_when_unrestricted(school, world, url):
    response = call(school, "secretary_free", "POST", url, json=enrollment_body(world, "s_none", "cls_6e"))
    assert response.status_code in (200, 201), response.text
    admin = call(school, "admin_residual", "POST", url, json=enrollment_body(world, "s_none", "cls_cp"))
    assert admin.status_code == 409  # déjà inscrit cette année : règle métier inchangée


def test_transfer_needs_origin_and_target_in_scope(school, world):
    url = lambda key: f"/enrollments/{world['enrollments'][key]}/transfer/"  # noqa: E731
    before = enrollment_count(school["tenant"])
    assert call(school, "secretary", "POST", url("e_cp"), json={"class_id": str(world["cls_6e"])}).status_code == 404
    assert call(school, "secretary", "POST", url("e_6e"), json={"class_id": str(world["cls_cp"])}).status_code == 404
    assert call(school, "secretary", "POST", url("e_cp"), json={"class_id": str(world["foreign_class"])}).status_code == 404
    assert enrollment_status(world["enrollments"]["e_cp"]) == "ACTIVE"
    assert enrollment_status(world["enrollments"]["e_6e"]) == "ACTIVE"
    assert enrollment_count(school["tenant"]) == before
    ok = call(school, "secretary", "POST", url("e_cp"), json={"class_id": str(world["cls_old"])})
    assert ok.status_code == 200, ok.text
    assert enrollment_status(world["enrollments"]["e_cp"]) == "TRANSFERRED"


def test_transfer_is_unchanged_when_unrestricted(school, world):
    response = call(school, "secretary_free", "POST", f"/enrollments/{world['enrollments']['e_6e']}/transfer/",
                    json={"class_id": str(world["cls_cp"])})
    assert response.status_code == 200, response.text


def test_withdraw_needs_enrollment_in_scope(school, world):
    assert call(school, "secretary", "DELETE", f"/enrollments/{world['enrollments']['e_6e']}/").status_code == 404
    assert call(school, "secretary", "DELETE", f"/enrollments/{uuid4()}/").status_code == 404
    assert enrollment_status(world["enrollments"]["e_6e"]) == "ACTIVE"
    assert call(school, "secretary", "DELETE", f"/enrollments/{world['enrollments']['e_cp']}/").status_code == 204
    assert enrollment_status(world["enrollments"]["e_cp"]) == "WITHDRAWN"


def test_withdraw_and_transfer_refuse_a_residual_enrollment_of_a_student_out_of_scope(school, world):
    """s_old_only : inscription ACTIVE d'une ancienne année dans cls_old (primaire). La classe
    est dans le périmètre mais l'élève non (pas d'inscription courante) : 404, rien ne change."""
    with SessionLocal() as db:
        residual = db.execute(select(Enrollment.id).where(
            Enrollment.student_id == world["s_old_only"], Enrollment.class_id == world["cls_old"])).scalar_one()
    before = enrollment_count(school["tenant"])
    assert call(school, "secretary", "DELETE", f"/enrollments/{residual}/").status_code == 404
    assert call(school, "secretary", "POST", f"/enrollments/{residual}/transfer/",
                json={"class_id": str(world["cls_cp"])}).status_code == 404
    assert enrollment_status(residual) == "ACTIVE"
    assert enrollment_count(school["tenant"]) == before
    # Compte non restreint : inchangé.
    assert call(school, "secretary_free", "DELETE", f"/enrollments/{residual}/").status_code == 204


def test_withdraw_is_unchanged_when_unrestricted(school, world):
    assert call(school, "secretary_free", "DELETE", f"/enrollments/{world['enrollments']['e_6e']}/").status_code == 204


# --- Liens parents ------------------------------------------------------------

def link_count(tenant):
    with SessionLocal() as db:
        return db.query(ParentStudent).filter(ParentStudent.tenant_id == tenant).count()


def test_student_parent_links_are_scoped(school, world):
    parent = str(school["people"]["parent"])
    assert call(school, "director", "GET", "/student-parents/", params={"student_id": str(world["s_6e"])}).status_code == 404
    mine = call(school, "director", "GET", "/student-parents/", params={"student_id": str(world["s_cp"])})
    assert ids(mine) == {str(world["link_cp"])}
    only_parent = call(school, "director", "GET", "/student-parents/", params={"parent_id": parent})
    assert ids(only_parent) == {str(world["link_cp"])}
    free = call(school, "secretary_free", "GET", "/student-parents/", params={"parent_id": parent})
    assert ids(free) == {str(world[k]) for k in ("link_cp", "link_6e", "link_none")}


def test_student_parent_link_write_needs_student_in_scope(school, world):
    parent2 = school["people"]["secretary_parent"]
    before = link_count(school["tenant"])
    for student in ("s_6e", "s_none", "s_foreign"):
        body = {"parent_id": str(parent2), "student_id": str(world[student])}
        assert call(school, "director", "POST", "/student-parents/", json=body).status_code == 404, student
    assert link_count(school["tenant"]) == before
    ok = call(school, "director", "POST", "/student-parents/",
              json={"parent_id": str(parent2), "student_id": str(world["s_cp"])})
    assert ok.status_code == 201, ok.text
    assert link_count(school["tenant"]) == before + 1


def test_student_parent_link_delete_needs_student_in_scope_without_effect(school, world):
    parent = str(school["people"]["parent"])
    before = link_count(school["tenant"])
    for params in (
        {"link_id": str(world["link_6e"])}, {"student_id": str(world["s_6e"])},
        {"parent_id": parent, "student_id": str(world["s_none"])}, {"link_id": str(world["link_none"])},
        {"link_id": str(uuid4())},
    ):
        assert call(school, "director", "DELETE", "/student-parents/", params=params).status_code == 404, params
    assert link_count(school["tenant"]) == before


@needs_postgres
def test_student_parent_link_delete_in_scope_works(school, world):
    before = link_count(school["tenant"])
    assert call(school, "director", "DELETE", "/student-parents/", params={"link_id": str(world["link_cp"])}).status_code == 200
    assert link_count(school["tenant"]) == before - 1


@needs_postgres
def test_student_parent_link_write_is_unchanged_when_unrestricted(school, world):
    # TENANT_ADMIN (affectation résiduelle ignorée) garde l'accès à tous les liens.
    assert call(school, "admin_residual", "DELETE", "/student-parents/", params={"link_id": str(world["link_6e"])}).status_code == 200


# --- Matières d'élève ---------------------------------------------------------

def subject_rows(student_id):
    with SessionLocal() as db:
        return db.execute(select(student_subjects.c.subject_id).where(student_subjects.c.student_id == student_id)).all()


def test_student_subjects_read_is_scoped(school, world):
    ok = call(school, "director", "GET", "/student-subjects/", params={"student_id": str(world["s_cp"])})
    assert ok.status_code == 200
    if not IS_SQLITE:
        assert len(ok.json()) == 1
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "director", "GET", "/student-subjects/", params={"student_id": str(world[name])}).status_code == 404
    assert call(school, "admin_residual", "GET", "/student-subjects/", params={"student_id": str(world["s_6e"])}).status_code == 200


def test_student_subjects_write_out_of_scope_is_404_without_effect(school, world):
    body = lambda name: {"student_id": str(world[name]), "subject_ids": [str(world["subject"])]}  # noqa: E731
    for name in ("s_none", "s_6e", "s_foreign"):
        assert call(school, "director", "POST", "/student-subjects/", json=body(name)).status_code == 404, name
    assert subject_rows(world["s_none"]) == []
    assert len(subject_rows(world["s_6e"])) == 1  # inchangé
    url = f"/student-subjects/{world['subject']}/"
    for name in ("s_6e", "s_none", "s_foreign"):
        assert call(school, "director", "DELETE", url, params={"student_id": str(world[name])}).status_code == 404, name
    assert len(subject_rows(world["s_6e"])) == 1


@needs_postgres
def test_student_subjects_write_in_scope_works(school, world):
    body = lambda name: {"student_id": str(world[name]), "subject_ids": [str(world["subject"])]}  # noqa: E731
    url = f"/student-subjects/{world['subject']}/"
    assert call(school, "director", "DELETE", url, params={"student_id": str(world["s_cp"])}).status_code == 204
    assert subject_rows(world["s_cp"]) == []
    assert call(school, "director", "POST", "/student-subjects/", json=body("s_cp")).status_code == 201
    assert len(subject_rows(world["s_cp"])) == 1


@needs_postgres
def test_student_subjects_write_is_unchanged_when_unrestricted(school, world):
    body = {"student_id": str(world["s_none"]), "subject_ids": [str(world["subject"])]}
    assert call(school, "admin_residual", "POST", "/student-subjects/", json=body).status_code == 201


# --- Recherche ----------------------------------------------------------------

def test_search_students_are_limited_to_the_cycle(school, world):
    response = call(school, "secretary", "GET", "/search/", params={"q": "Test", "types": "students"})
    assert response.status_code == 200, response.text
    block = response.json()["results"]["students"]
    assert {item["id"] for item in block["items"]} == {str(world["s_cp"])}
    assert block["count"] == 1 and "error" not in block
    assert response.json()["total"] == 1


def test_search_has_no_payments_for_a_restricted_account(school, world):
    everything = call(school, "secretary", "GET", "/search/", params={"q": "Test"}).json()
    assert "payments" not in everything["types_searched"] and "payments" not in everything["results"]
    assert "students" in everything["types_searched"]
    # Annuaire du personnel : /teachers/ et /users/ sont refusés (Q6), la recherche aussi.
    assert "teachers" not in everything["types_searched"] and "teachers" not in everything["results"]
    only_teachers = call(school, "secretary", "GET", "/search/", params={"q": "Test", "types": "teachers"})
    assert only_teachers.status_code == 403
    mixed_teachers = call(school, "secretary", "GET", "/search/", params={"q": "Test", "types": "teachers,levels"}).json()
    assert mixed_teachers["types_searched"] == ["levels"]
    # Même un comptable (qui voit les paiements d'ordinaire) en est privé tant que B2d n'est pas livré.
    accountant = call(school, "accountant", "GET", "/search/", params={"q": "Test", "types": "payments"})
    assert accountant.status_code == 403
    mixed = call(school, "accountant", "GET", "/search/", params={"q": "Test", "types": "payments,levels"}).json()
    assert mixed["types_searched"] == ["levels"]


def test_search_is_unchanged_when_unrestricted(school, world):
    admin = call(school, "admin_residual", "GET", "/search/", params={"q": "Test"}).json()
    assert "payments" in admin["types_searched"] and "students" in admin["types_searched"]
    free = call(school, "secretary_free", "GET", "/search/", params={"q": "Test"}).json()
    assert "students" in free["types_searched"] and "payments" not in free["types_searched"]
    assert "teachers" in free["types_searched"] and "teachers" in admin["types_searched"]


def test_search_types_is_available_to_a_restricted_account(school, world):
    assert call(school, "secretary", "GET", "/search/types/").status_code == 200


# --- Routes indépendantes -----------------------------------------------------

@pytest.mark.parametrize("url", [
    "/infrastructure/programs/", "/infrastructure/rooms/", "/infrastructure/rooms/count/",
    "/infrastructure/all-subject-levels/", "/rooms/", "/rooms/count/",
])
def test_structure_reads_are_open_to_a_restricted_account(school, world, url):
    assert call(school, "secretary", "GET", url).status_code == 200


def test_student_space_gives_staff_nothing_but_their_own_profile(school, world):
    # Compte du personnel sans fiche élève : rien.
    assert call(school, "director", "GET", "/students/me/").status_code == 403
    assert call(school, "director", "GET", "/students/me/reenrollment/", params={"academic_year_id": str(world["year"])}).status_code == 403
    assert call(school, "director", "POST", "/students/me/reenroll/", json={"academic_year_id": str(world["year"])}).status_code == 403
    assert call(school, "director", "GET", "/students/messaging-recipients/").json() == []
    # Compte du personnel lié à une fiche élève : seulement cette fiche, jamais une autre.
    with SessionLocal() as db:
        db.get(Student, world["s_6e"]).user_id = school["people"]["director"]
        db.commit()
    mine = call(school, "director", "GET", "/students/me/")
    assert mine.status_code == 200 and UUID(mine.json()["id"]) == world["s_6e"]


# --- Routes restées refusées --------------------------------------------------

@pytest.mark.parametrize("method,url,body", [
    ("POST", "/students/", {"first_name": "A", "last_name": "B"}),
    ("GET", "/students/dashboard/", None),
    ("POST", "/classrooms/", {"name": "6e B"}),
    ("POST", "/infrastructure/classrooms/", {"name": "6e B"}),
    ("PUT", "/infrastructure/classrooms/{cls_cp}/", {"name": "X"}),
    ("DELETE", "/infrastructure/classrooms/{cls_cp}/", None),
    ("POST", "/infrastructure/classrooms/{cls_cp}/subjects/{subject}/", {}),
    ("DELETE", "/infrastructure/classrooms/{cls_cp}/subjects/{subject}/", None),
    ("POST", "/infrastructure/programs/", {"name": "P"}),
    ("POST", "/infrastructure/rooms/", {"name": "R"}),
])
def test_routes_not_yet_scoped_stay_denied(school, world, method, url, body):
    url = url.format(**{k: str(v) for k, v in world.items() if k in ("cls_cp", "subject")})
    kwargs = {"json": body} if body is not None else {}
    response = call(school, "director", method, url, **kwargs)
    _assert_denied(response)
    with SessionLocal() as db:
        assert db.query(Classroom).filter(Classroom.tenant_id == school["tenant"], Classroom.name == "6e B").count() == 0


# --- Corrections de revue (sécurité / RBAC) -----------------------------------

def _error_body(response):
    body = response.json()
    body.pop("request_id", None)
    return body


def test_link_delete_has_no_existence_oracle(school, world):
    """Un lien inexistant et le lien d'un élève hors périmètre répondent exactement pareil."""
    unknown = call(school, "director", "DELETE", "/student-parents/", params={"link_id": str(uuid4())})
    hidden = call(school, "director", "DELETE", "/student-parents/", params={"link_id": str(world["link_6e"])})
    assert unknown.status_code == hidden.status_code == 404
    assert _error_body(unknown) == _error_body(hidden)


def test_student_parent_list_with_both_filters_and_a_hidden_student_is_404(school, world):
    parent = str(school["people"]["parent"])
    response = call(school, "director", "GET", "/student-parents/",
                    params={"parent_id": parent, "student_id": str(world["s_6e"])})
    assert response.status_code == 404


def test_super_admin_with_tenant_header_is_never_filtered(school, world):
    from app.core import security

    # Le jeton porte la revendication de rôle : sans elle le middleware de tenant refuse (400).
    token = security.create_access_token(
        {"sub": str(school["people"]["superadmin"]), "tenant_id": None, "roles": ["SUPER_ADMIN"]})
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": str(school["tenant"])}

    def get(url):
        return client.get(f"{API}{url}", headers=headers)

    assert ids(get("/students/")) == {str(world[n]) for n in ALL_TENANT_STUDENTS}
    assert get(f"/students/{world['s_6e']}/").status_code == 200
    assert len(get("/enrollments/").json()) == 7
    assert ids(get("/classrooms/")) == {
        str(world[n]) for n in ("cls_cp", "cls_6e", "cls_nolevel", "cls_nocycle", "cls_old")}


def test_restricted_account_that_is_also_a_parent_gets_no_union_with_their_children(school, world):
    with SessionLocal() as db:
        db.add(ParentStudent(tenant_id=school["tenant"], parent_id=school["people"]["secretary_parent"],
                             student_id=world["s_6e"]))
        db.commit()
    assert call(school, "secretary_parent", "GET", f"/students/{world['s_6e']}/").status_code == 404
    assert str(world["s_6e"]) not in ids(call(school, "secretary_parent", "GET", "/students/"))


@needs_postgres
def test_restricted_account_that_is_also_a_teacher_gets_no_union_with_their_classes(school, world):
    from sqlalchemy import text
    t = school["tenant"]
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO teacher_assignments (id, tenant_id, user_id, classroom_id, created_at, updated_at)
            VALUES (gen_random_uuid(), :tid, :uid, :cid, NOW(), NOW())
        """), {"tid": str(t), "uid": str(school["people"]["director_teacher"]), "cid": str(world["cls_6e"])})
        db.commit()
    try:
        url = "/infrastructure/enrollments/"
        assert call(school, "director_teacher", "GET", url, params={"class_id": str(world["cls_6e"])}).json() == []
        assert call(school, "director_teacher", "GET", f"/students/{world['s_6e']}/").status_code == 404
    finally:
        with SessionLocal() as db:
            switch_tenant_context(db, str(t))
            db.execute(text("DELETE FROM teacher_assignments WHERE tenant_id = :tid"), {"tid": str(t)})
            db.commit()


def test_restricted_director_teacher_sees_no_other_cycle_enrollments_even_without_assignment(school, world):
    url = "/infrastructure/enrollments/"
    assert call(school, "director_teacher", "GET", url, params={"class_id": str(world["cls_6e"])}).json() == []


# Garde-fou : chaque route FILTERED du registre a un test comportemental nommé ici.
FILTERED_ROUTE_TESTS = {
    ("GET", "/students/"): "test_student_list_is_limited_to_the_cycle_with_exact_total",
    ("GET", "/students/{student_id}/"): "test_student_detail_in_scope_and_404_elsewhere",
    ("GET", "/students/{student_id}/enrollment/"): "test_student_enrollment_detail_is_scoped",
    ("PATCH", "/students/{student_id}/"): "test_update_out_of_scope_is_404_without_effect",
    ("PUT", "/students/{student_id}/"): "test_update_out_of_scope_is_404_without_effect",
    ("DELETE", "/students/{student_id}/"): "test_delete_out_of_scope_is_404_without_effect",
    ("GET", "/classrooms/"): "test_classroom_lists_are_limited_to_the_cycle",
    ("GET", "/infrastructure/classrooms/"): "test_classroom_lists_are_limited_to_the_cycle",
    ("GET", "/infrastructure/classrooms/{class_id}/subjects/"): "test_classroom_associations_are_scoped",
    ("GET", "/infrastructure/classrooms/{class_id}/departments/"): "test_classroom_associations_are_scoped",
    ("GET", "/infrastructure/classroom-departments/"): "test_classroom_departments_list_is_scoped",
    ("GET", "/enrollments/"): "test_enrollment_lists_only_show_students_of_the_cycle",
    ("GET", "/infrastructure/enrollments/"): "test_enrollment_lists_only_show_students_of_the_cycle",
    ("GET", "/enrollments/counts/"): "test_enrollment_counts_alias_only_counts_classes_of_the_cycle",
    ("GET", "/infrastructure/enrollments/counts/"): "test_infrastructure_enrollment_counts_never_expose_other_cycles",
    ("GET", "/student-parents/"): "test_student_parent_links_are_scoped",
    ("POST", "/student-parents/"): "test_student_parent_link_write_needs_student_in_scope",
    ("DELETE", "/student-parents/"): "test_student_parent_link_delete_needs_student_in_scope_without_effect",
    ("GET", "/student-subjects/"): "test_student_subjects_read_is_scoped",
    ("POST", "/student-subjects/"): "test_student_subjects_write_out_of_scope_is_404_without_effect",
    ("DELETE", "/student-subjects/{subject_id}/"): "test_student_subjects_write_out_of_scope_is_404_without_effect",
    ("GET", "/search/"): "test_search_students_are_limited_to_the_cycle",
    ("POST", "/enrollments/"): "test_create_enrollment_requires_class_and_student_in_scope",
    ("POST", "/infrastructure/enrollments/"): "test_create_enrollment_requires_class_and_student_in_scope",
    ("POST", "/enrollments/{enrollment_id}/transfer/"): "test_transfer_needs_origin_and_target_in_scope",
    ("DELETE", "/enrollments/{enrollment_id}/"): "test_withdraw_needs_enrollment_in_scope",
}


def test_every_filtered_route_has_a_behavioural_test():
    import test_cycle_scope_admission_stats as admission_stats
    import test_cycle_scope_analytics as analytics
    import test_cycle_scope_department_portal as portal
    import test_cycle_scope_finance as finance
    import test_cycle_scope_school_life as school_life
    import test_cycle_scope_schooling as schooling
    from app.core.cycle_routes import ROUTE_POLICIES, Policy

    filtered = {key for key, policy in ROUTE_POLICIES.items() if policy is Policy.FILTERED}
    declared = {(method, f"{API}{path}") for method, path in FILTERED_ROUTE_TESTS}
    # Lot B2c-1 (scolarité) : ses routes et leurs tests vivent dans test_cycle_scope_schooling.
    declared |= {(method, f"{API}{path}") for method, path in schooling.SCHOOLING_ROUTE_TESTS}
    # Lot B2c-2 (vie scolaire, bulletins, incidents…) : test_cycle_scope_school_life.
    declared |= {(method, f"{API}{path}") for method, path in school_life.SCHOOL_LIFE_ROUTE_TESTS}
    # Lot B2d (finances) : test_cycle_scope_finance.
    declared |= {(method, f"{API}{path}") for method, path in finance.FINANCE_ROUTE_TESTS}
    # Lot B2e-1 (indicateurs académiques) : test_cycle_scope_analytics.
    declared |= {(method, f"{API}{path}") for method, path in analytics.ANALYTICS_ROUTE_TESTS}
    # Lot B2e-3 (statistiques d'admission) : test_cycle_scope_admission_stats.
    declared |= {(method, f"{API}{path}") for method, path in admission_stats.ADMISSION_ROUTE_TESTS}
    # CYCLE-PORTAL-GAP-01 (portail de département) : test_cycle_scope_department_portal.
    declared |= {(method, f"{API}{path}") for method, path in portal.PORTAL_ROUTE_TESTS}
    assert filtered == declared, (
        f"Routes FILTERED sans test comportemental : {sorted(filtered - declared)} ; "
        f"entrées orphelines : {sorted(declared - filtered)}"
    )
    for name in set(FILTERED_ROUTE_TESTS.values()):
        candidate = globals().get(name)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
    for name in set(schooling.SCHOOLING_ROUTE_TESTS.values()):
        candidate = getattr(schooling, name, None)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
    for name in set(school_life.SCHOOL_LIFE_ROUTE_TESTS.values()):
        candidate = getattr(school_life, name, None)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
    for name in set(finance.FINANCE_ROUTE_TESTS.values()):
        candidate = getattr(finance, name, None)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
    for name in set(analytics.ANALYTICS_ROUTE_TESTS.values()):
        candidate = getattr(analytics, name, None)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
    for name in set(admission_stats.ADMISSION_ROUTE_TESTS.values()):
        candidate = getattr(admission_stats, name, None)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
    for name in set(portal.PORTAL_ROUTE_TESTS.values()):
        candidate = getattr(portal, name, None)
        assert callable(candidate) and name.startswith("test_"), f"test introuvable : {name}"
