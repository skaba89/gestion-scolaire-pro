"""Lot B2e-3 (2026-11-23) : statistiques d'admission par cycle (décision Q-E1).

Un compte limité au primaire ne compte que les candidatures dont le niveau demandé (``level_id``)
appartient au primaire ; une candidature sans niveau, d'un niveau sans cycle ou d'un autre
établissement n'est jamais comptée. Un compte non restreint voit toutes les candidatures.
PostgreSQL uniquement (comme les autres tests du périmètre par cycle).
"""
from uuid import uuid4

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models.admission import AdmissionApplication, AdmissionStatus  # noqa: E402
from test_cycle_scope_gate import school, structure  # noqa: E402,F401
from test_cycle_scope_students import call, world  # noqa: E402,F401

needs_postgres = pytest.mark.skipif(engine.dialect.name == "sqlite", reason="périmètre par cycle : PostgreSQL")

# Registre lu par test_cycle_scope_students::test_every_filtered_route_has_a_behavioural_test.
ADMISSION_ROUTE_TESTS = {
    ("GET", "/admissions/stats/"): "test_admission_stats_count_only_the_levels_of_the_cycle",
}


def test_admission_stats_route_is_filtered_and_the_rest_of_admissions_stays_denied():
    assert policy_for("GET", "/api/v1/admissions/stats/") is Policy.FILTERED
    assert policy_for("GET", "/api/v1/admissions/") is Policy.DENY
    # Le portail de département est ouvert par CYCLE-PORTAL-GAP-01 ; l'e-learning reste refusé.
    assert policy_for("GET", "/api/v1/analytics/elearning/courses/") is Policy.DENY


@pytest.fixture
def applications(school, world):
    t, o = school["tenant"], school["other"]
    rows = (
        (t, "lvl_cp", AdmissionStatus.SUBMITTED), (t, "lvl_cp", AdmissionStatus.ACCEPTED),
        (t, "lvl_6e", AdmissionStatus.SUBMITTED), (t, "lvl_nocycle", AdmissionStatus.SUBMITTED),
        (t, None, AdmissionStatus.UNDER_REVIEW), (o, "foreign_level", AdmissionStatus.SUBMITTED),
    )
    with SessionLocal() as db:
        for tid, level, status in rows:
            db.add(AdmissionApplication(
                id=uuid4(), tenant_id=tid, level_id=world[level] if level else None, status=status,
                student_first_name="Kadiatou", student_last_name="Bah", parent_first_name="Ousmane",
                parent_last_name="Bah", parent_email=f"p-{uuid4().hex[:8]}@example.gn", parent_phone="+224620000000",
            ))
        db.commit()
    yield
    with SessionLocal() as db:
        for tid in (t, o):
            switch_tenant_context(db, str(tid))
            db.query(AdmissionApplication).filter(AdmissionApplication.tenant_id == tid).delete()
        db.commit()


@needs_postgres
def test_admission_stats_count_only_the_levels_of_the_cycle(school, applications):
    for who in ("secretary", "director"):
        response = call(school, who, "GET", "/admissions/stats/")
        assert response.status_code == 200, (who, response.text)
        body = response.json()
        assert (body["total"], body["SUBMITTED"], body["ACCEPTED"], body["UNDER_REVIEW"]) == (2, 1, 1, 0), who

    free = call(school, "secretary_free", "GET", "/admissions/stats/").json()
    # Tout l'établissement : 5 candidatures (dont sans niveau et niveau sans cycle), jamais l'autre école.
    assert (free["total"], free["SUBMITTED"], free["UNDER_REVIEW"]) == (5, 3, 1)
