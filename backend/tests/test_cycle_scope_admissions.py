"""Admissions pour les comptes limités à des cycles (Q-B3-2, décision Q-A1, 2026-11-24).

Le secrétariat et la direction, limités au primaire, ne voient et ne traitent que les candidatures
d'un niveau du primaire (``lvl_cp``) ; une candidature du collège, sans niveau ou d'un niveau sans
cycle est introuvable (404). La conversion en élève inscrit l'élève dans une classe de leurs cycles,
obligatoire pour eux (sinon l'élève créé sortirait de leur périmètre). PostgreSQL uniquement.
"""
from uuid import uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models.admission import AdmissionApplication, AdmissionStatus  # noqa: E402
from app.models.enrollment import Enrollment  # noqa: E402
from app.models.student import Student  # noqa: E402
from test_cycle_scope_gate import school, structure  # noqa: E402,F401
from test_cycle_scope_students import call, world  # noqa: E402,F401

needs_postgres = pytest.mark.skipif(engine.dialect.name == "sqlite", reason="périmètre par cycle : PostgreSQL")
RESTRICTED = ("secretary", "director")

# Registre lu par test_cycle_scope_students::test_every_filtered_route_has_a_behavioural_test.
ADMISSIONS_ROUTE_TESTS = {
    ("GET", "/admissions/"): "test_restricted_account_reads_only_the_applications_of_its_cycles",
    ("GET", "/admissions/{admission_id}/"): "test_restricted_account_reads_only_the_applications_of_its_cycles",
    ("GET", "/admissions/{admission_id}/timeline/"): "test_restricted_account_reads_only_the_applications_of_its_cycles",
    ("POST", "/admissions/"): "test_application_writes_stay_in_the_cycles_of_the_account",
    ("PATCH", "/admissions/{admission_id}/"): "test_application_writes_stay_in_the_cycles_of_the_account",
    ("PATCH", "/admissions/{admission_id}/status/"): "test_application_writes_stay_in_the_cycles_of_the_account",
    ("DELETE", "/admissions/{admission_id}/"): "test_application_writes_stay_in_the_cycles_of_the_account",
    ("POST", "/admissions/{admission_id}/convert/"): "test_conversion_enrolls_the_student_in_a_class_of_the_scope",
}


def test_routes_are_classified():
    for method, path in ADMISSIONS_ROUTE_TESTS:
        assert policy_for(method, f"/api/v1{path}") is Policy.FILTERED, (method, path)
    # Portail parent (Q-B3-1) : la réinscription en ligne reste refusée à un compte restreint.
    assert policy_for("GET", "/api/v1/admissions/reenrollments/mine/") is Policy.DENY
    assert policy_for("POST", "/api/v1/admissions/reenrollments/") is Policy.DENY


@pytest.fixture
def applications(school, world):
    t = school["tenant"]
    rows = {
        "cp_submitted": ("lvl_cp", AdmissionStatus.SUBMITTED), "cp_draft": ("lvl_cp", AdmissionStatus.DRAFT),
        "cp_accepted": ("lvl_cp", AdmissionStatus.ACCEPTED), "cp_accepted_2": ("lvl_cp", AdmissionStatus.ACCEPTED),
        "6e_draft": ("lvl_6e", AdmissionStatus.DRAFT), "6e_accepted": ("lvl_6e", AdmissionStatus.ACCEPTED),
        "nocycle": ("lvl_nocycle", AdmissionStatus.SUBMITTED), "nolevel": (None, AdmissionStatus.SUBMITTED),
    }
    ids = {key: uuid4() for key in rows}
    with SessionLocal() as db:
        for key, (level, status) in rows.items():
            db.add(AdmissionApplication(
                id=ids[key], tenant_id=t, level_id=world[level] if level else None, status=status,
                academic_year_id=world["year"], student_first_name="Kadiatou", student_last_name=key,
                student_date_of_birth="2018-03-01", parent_first_name="Ousmane", parent_last_name="Bah",
                # Sans e-mail : la conversion ne crée ni ne rattache de compte parent.
                parent_email="", parent_phone="+224620000000",
            ))
        db.commit()
    yield {**world, **ids}
    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        converted = [row.converted_student_id for row in db.query(AdmissionApplication).filter(
            AdmissionApplication.tenant_id == t, AdmissionApplication.converted_student_id.isnot(None))]
        db.query(AdmissionApplication).filter(AdmissionApplication.tenant_id == t).delete()
        if converted:
            db.query(Enrollment).filter(Enrollment.student_id.in_(converted)).delete(synchronize_session=False)
            db.query(Student).filter(Student.id.in_(converted)).delete(synchronize_session=False)
        db.commit()


def application_status(application_id, school):
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        row = db.query(AdmissionApplication).filter(AdmissionApplication.id == application_id).first()
        return None if row is None else getattr(row.status, "value", row.status)


@needs_postgres
def test_restricted_account_reads_only_the_applications_of_its_cycles(school, applications):
    in_scope = {str(applications[k]) for k in ("cp_submitted", "cp_draft", "cp_accepted", "cp_accepted_2")}
    for who in RESTRICTED:
        body = call(school, who, "GET", "/admissions/", params={"limit": 200}).json()
        assert {item["id"] for item in body["items"]} == in_scope, who
        assert body["total"] == 4, who
        # Filtre explicite sur un niveau du collège : liste vide, rien n'est révélé.
        assert call(school, who, "GET", "/admissions/", params={"level_id": str(applications["lvl_6e"])}).json()["total"] == 0
        assert call(school, who, "GET", f"/admissions/{applications['cp_submitted']}/").status_code == 200
        assert call(school, who, "GET", f"/admissions/{applications['cp_submitted']}/timeline/").status_code == 200
        for key in ("6e_draft", "nocycle", "nolevel"):
            assert call(school, who, "GET", f"/admissions/{applications[key]}/").status_code == 404, (who, key)
            assert call(school, who, "GET", f"/admissions/{applications[key]}/timeline/").status_code == 404, (who, key)
    assert call(school, "secretary_free", "GET", "/admissions/", params={"limit": 200}).json()["total"] == 8


@needs_postgres
def test_application_writes_stay_in_the_cycles_of_the_account(school, applications):
    person = {"student_first_name": "Aïssatou", "student_last_name": "Diallo", "parent_first_name": "Mamadou",
              "parent_last_name": "Diallo", "parent_email": "parent@example.gn", "parent_phone": "+224621000000"}
    # Création : niveau du collège introuvable, sans niveau refusé, niveau du primaire accepté.
    assert call(school, "secretary", "POST", "/admissions/", json={**person, "level_id": str(applications["lvl_6e"])}).status_code == 404
    assert call(school, "secretary", "POST", "/admissions/", json=person).status_code == 403
    created = call(school, "secretary", "POST", "/admissions/", json={**person, "level_id": str(applications["lvl_cp"])})
    assert created.status_code == 201, created.text
    # Modification : candidature du collège introuvable ; une candidature du primaire ne part pas au collège.
    assert call(school, "secretary", "PATCH", f"/admissions/{applications['6e_draft']}/", json={"notes": "x"}).status_code == 404
    assert call(school, "secretary", "PATCH", f"/admissions/{applications['cp_draft']}/",
                json={"level_id": str(applications["lvl_6e"])}).status_code == 404
    assert call(school, "secretary", "PATCH", f"/admissions/{applications['cp_draft']}/", json={"notes": "ok"}).status_code == 200
    # Statut : seulement dans le périmètre.
    assert call(school, "director", "PATCH", f"/admissions/{applications['6e_draft']}/status/",
                json={"status": "SUBMITTED"}).status_code == 404
    assert application_status(applications["6e_draft"], school) == "DRAFT"
    assert call(school, "director", "PATCH", f"/admissions/{applications['cp_submitted']}/status/",
                json={"status": "UNDER_REVIEW"}).status_code == 200
    # Suppression : brouillon du collège intact.
    assert call(school, "secretary", "DELETE", f"/admissions/{applications['6e_draft']}/").status_code == 404
    assert application_status(applications["6e_draft"], school) == "DRAFT"
    assert call(school, "secretary", "DELETE", f"/admissions/{created.json()['id']}/").status_code == 204


def enrollments_of(student_id, school):
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        return [(str(e.class_id), e.status) for e in db.query(Enrollment).filter(Enrollment.student_id == student_id)]


def student_count(school):
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        return db.query(Student).filter(Student.tenant_id == school["tenant"]).count()


@needs_postgres
def test_conversion_enrolls_the_student_in_a_class_of_the_scope(school, applications):
    convert = lambda who, key, body: call(school, who, "POST", f"/admissions/{applications[key]}/convert/", json=body)  # noqa: E731
    before = student_count(school)
    # Compte restreint : classe obligatoire, et de ses cycles ; candidature du collège introuvable.
    assert convert("secretary", "cp_accepted", {}).status_code == 403
    assert convert("secretary", "cp_accepted", {"class_id": str(applications["cls_6e"])}).status_code == 404
    assert convert("secretary", "6e_accepted", {"class_id": str(applications["cls_cp"])}).status_code == 404
    assert student_count(school) == before and application_status(applications["cp_accepted"], school) == "ACCEPTED"

    done = convert("secretary", "cp_accepted", {"class_id": str(applications["cls_cp"])})
    assert done.status_code == 200, done.text
    student_id = done.json()["student_id"]
    assert done.json()["enrollment_id"]
    assert enrollments_of(student_id, school) == [(str(applications["cls_cp"]), "ACTIVE")]
    # L'élève créé est dans le périmètre du secrétariat : visible tout de suite (et sa fiche répond même
    # sans e-mail de parent : ADM-CONVERT-EMAIL-01).
    seen = call(school, "secretary", "GET", f"/students/{student_id}/")
    assert seen.status_code == 200, seen.text

    # Compte non restreint : classe d'un autre niveau refusée, rien n'est créé ; sans classe, inchangé.
    assert convert("secretary_free", "cp_accepted_2", {"class_id": str(applications["cls_6e"])}).status_code == 400
    assert student_count(school) == before + 1
    assert application_status(applications["cp_accepted_2"], school) == "ACCEPTED"
    free = convert("secretary_free", "cp_accepted_2", {})
    assert free.status_code == 200, free.text
    assert free.json()["enrollment_id"] is None and enrollments_of(free.json()["student_id"], school) == []
