"""Opt-in restriction of staff accounts to pedagogical cycles (lot B1).

Real JWT, real role lookup, real tenant resolution. Only Redis revocation
is controlled. Enforcement on data routes is lot B2: here we verify the
recorded policy, its guards and the computed scope.
"""
from uuid import UUID, uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.api.v1.endpoints.core import auth as auth_endpoints  # noqa: E402
from app.core import security  # noqa: E402
from app.core.cycle_scope import allowed_cycle_ids, can_be_cycle_restricted  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EducationCycle, StaffCycleAssignment, Tenant, User, UserRole  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402

URL = "/api/v1/education/staff-cycles/"


@pytest.fixture
def school(monkeypatch):
    app.dependency_overrides.pop(security.get_current_user, None)
    monkeypatch.setattr(security, "_evaluate_revocation", AsyncMock(return_value=True))
    revoke = AsyncMock(return_value=1)
    monkeypatch.setattr(auth_endpoints, "blacklist_all_user_tokens", revoke)
    tenant, other = uuid4(), uuid4()
    people = {name: uuid4() for name in (
        "admin", "director", "secretary", "accountant", "teacher", "teacher_secretary", "foreign_director",
    )}
    roles = {
        "admin": ["TENANT_ADMIN"], "director": ["DIRECTOR"], "secretary": ["SECRETARY"],
        "accountant": ["ACCOUNTANT"], "teacher": ["TEACHER"], "teacher_secretary": ["TEACHER", "SECRETARY"],
    }
    cycles = {name: uuid4() for name in ("primaire", "college", "lycee", "archived", "foreign")}
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Groupe scolaire", slug=f"gs-{tid}", type="mixed"))
        db.flush()
        for name, uid in people.items():
            owner = other if name == "foreign_director" else tenant
            db.add(User(id=uid, tenant_id=owner, email=f"{name}-{uid}@example.gn", username=str(uid),
                        password_hash="x", is_active=True, first_name=name, last_name="Test"))
            db.flush()
            for role in roles.get(name, ["DIRECTOR"]):
                db.add(UserRole(tenant_id=owner, user_id=uid, role=role))
        for order, (name, cid) in enumerate(cycles.items()):
            db.add(EducationCycle(
                id=cid, tenant_id=other if name == "foreign" else tenant, code=name.upper(), name=name,
                institution_type="primary", period_type="TRIMESTER", order_index=order,
                is_active=name != "archived", revision=1,
            ))
        db.commit()

    def headers(who="admin"):
        owner = other if who == "foreign_director" else tenant
        token = security.create_access_token({"sub": str(people[who]), "tenant_id": str(owner)})
        return {"Authorization": f"Bearer {token}"}

    yield dict(tenant=tenant, other=other, people=people, cycles=cycles, headers=headers, revoke=revoke)
    app.dependency_overrides.pop(security.get_current_user, None)
    # Suites that later wipe users must not trip on this new table's rows.
    from app.core.database import switch_tenant_context
    with SessionLocal() as db:
        for tid in (tenant, other):
            switch_tenant_context(db, str(tid))
            db.query(StaffCycleAssignment).filter(StaffCycleAssignment.tenant_id == tid).delete()
        db.commit()


def _put(s, who, cycle_names, expected=(), actor="admin"):
    return client.put(f"{URL}{s['people'][who]}/", headers=s["headers"](actor), json={
        "expected_cycle_ids": [str(s["cycles"][name]) for name in expected],
        "cycle_ids": [str(s["cycles"][name]) for name in cycle_names],
    })


def _stored(s, who):
    with SessionLocal() as db:
        return {
            cycle_id for (cycle_id,) in db.query(StaffCycleAssignment.cycle_id).filter(
                StaffCycleAssignment.tenant_id == s["tenant"],
                StaffCycleAssignment.user_id == s["people"][who],
            ).all()
        }


def test_listing_shows_only_restrictable_staff_and_never_claims_enforcement(school):
    response = client.get(URL, headers=school["headers"]())
    assert response.status_code == 200, response.text
    body = response.json()
    names = {item["first_name"] for item in body["items"]}
    assert names == {"director", "secretary", "accountant", "teacher_secretary"}
    assert body["total"] == 4 and body["cycle_policy_available"] is True
    assert all(item["cycle_ids"] == [] and item["restrictable"] for item in body["items"])


def test_assignment_is_stored_audited_and_revokes_the_target_sessions(school):
    response = _put(school, "director", ["college", "lycee"])
    assert response.status_code == 200, response.text
    assert set(response.json()["cycle_ids"]) == {str(school["cycles"]["college"]), str(school["cycles"]["lycee"])}
    assert _stored(school, "director") == {school["cycles"]["college"], school["cycles"]["lycee"]}
    school["revoke"].assert_awaited_once_with(str(school["people"]["director"]))
    with SessionLocal() as db:
        audit = db.query(AuditLog).filter(
            AuditLog.tenant_id == school["tenant"], AuditLog.action == "ASSIGN_STAFF_CYCLES",
        ).one()
        assert audit.resource_id == str(school["people"]["director"])
        assert audit.details["restricted"] is True and audit.details["previous_cycle_ids"] == []

    # Narrowing, then clearing, both require the set the admin last saw.
    narrowed = _put(school, "director", ["lycee"], expected=["college", "lycee"])
    assert narrowed.status_code == 200, narrowed.text
    cleared = _put(school, "director", [], expected=["lycee"])
    assert cleared.status_code == 200 and cleared.json()["cycle_ids"] == []
    assert _stored(school, "director") == set()


def test_stale_expected_set_is_rejected_without_side_effect(school):
    assert _put(school, "secretary", ["primaire"]).status_code == 200
    school["revoke"].reset_mock()
    stale = _put(school, "secretary", ["college"], expected=[])
    assert stale.status_code == 409
    assert _stored(school, "secretary") == {school["cycles"]["primaire"]}
    school["revoke"].assert_not_awaited()


def test_unchanged_assignment_is_a_noop_without_audit_or_logout(school):
    assert _put(school, "accountant", ["primaire"]).status_code == 200
    school["revoke"].reset_mock()
    again = _put(school, "accountant", ["primaire"], expected=["primaire"])
    assert again.status_code == 200
    school["revoke"].assert_not_awaited()
    with SessionLocal() as db:
        assert db.query(AuditLog).filter(
            AuditLog.tenant_id == school["tenant"], AuditLog.action == "ASSIGN_STAFF_CYCLES",
        ).count() == 1


def test_foreign_or_unknown_cycle_is_rejected_anti_idor(school):
    foreign = _put(school, "director", ["foreign"])
    assert foreign.status_code == 422
    unknown = client.put(f"{URL}{school['people']['director']}/", headers=school["headers"](), json={
        "expected_cycle_ids": [], "cycle_ids": [str(uuid4())],
    })
    assert unknown.status_code == 422
    assert _stored(school, "director") == set()


def test_user_of_another_tenant_cannot_be_targeted(school):
    response = _put(school, "foreign_director", ["primaire"])
    assert response.status_code == 404
    with SessionLocal() as db:
        assert db.query(StaffCycleAssignment).filter(
            StaffCycleAssignment.user_id == school["people"]["foreign_director"],
        ).count() == 0


def test_archived_cycle_cannot_be_added_but_can_be_removed(school):
    assert _put(school, "director", ["archived"]).status_code == 409
    with SessionLocal() as db:
        db.add(StaffCycleAssignment(tenant_id=school["tenant"], user_id=school["people"]["director"],
                                    cycle_id=school["cycles"]["archived"]))
        db.commit()
    removed = _put(school, "director", ["college"], expected=["archived"])
    assert removed.status_code == 200, removed.text
    assert _stored(school, "director") == {school["cycles"]["college"]}


@pytest.mark.parametrize("who", ["teacher", "admin"])
def test_teachers_and_administrators_are_never_cycle_restricted(school, who):
    assert _put(school, who, ["primaire"]).status_code == 422
    assert _stored(school, who) == set()
    # Clearing is always allowed (e.g. a since-promoted account).
    assert _put(school, who, []).status_code == 200


def test_teacher_with_an_administrative_role_is_restrictable(school):
    assert _put(school, "teacher_secretary", ["college"]).status_code == 200


@pytest.mark.parametrize("actor", ["director", "secretary", "teacher"])
def test_only_establishment_administration_reads_or_writes_restrictions(school, actor):
    assert client.get(URL, headers=school["headers"](actor)).status_code == 403
    assert _put(school, "accountant", ["primaire"], actor=actor).status_code == 403
    assert _stored(school, "accountant") == set()


def test_foreign_administrator_header_cannot_reach_another_school(school):
    headers = {**school["headers"]("foreign_director"), "X-Tenant-ID": str(school["tenant"])}
    assert client.get(URL, headers=headers).status_code == 403
    response = client.put(f"{URL}{school['people']['secretary']}/", headers=headers, json={
        "expected_cycle_ids": [], "cycle_ids": [str(school["cycles"]["primaire"])],
    })
    assert response.status_code == 403
    assert _stored(school, "secretary") == set()


def test_audit_failure_rolls_back_the_assignment(school, monkeypatch):
    from app.services import education_modules

    def refuse(*args, **kwargs):
        raise HTTPException(status_code=503, detail="Audit indisponible ; configuration inchangée")
    import app.api.v1.endpoints.core.education as education_endpoints
    monkeypatch.setattr(education_endpoints, "record_configuration_audit", refuse)
    assert education_modules.record_configuration_audit is not refuse
    assert _put(school, "director", ["college"]).status_code == 503
    assert _stored(school, "director") == set()
    school["revoke"].assert_not_awaited()


def test_computed_scope_is_opt_in_and_ignores_rows_of_administrators(school):
    people, tenant = school["people"], school["tenant"]
    with SessionLocal() as db:
        director = {"id": str(people["director"]), "roles": ["DIRECTOR"]}
        assert allowed_cycle_ids(db, tenant_id=tenant, user=director) is None
        db.add(StaffCycleAssignment(tenant_id=tenant, user_id=people["director"], cycle_id=school["cycles"]["lycee"]))
        db.add(StaffCycleAssignment(tenant_id=tenant, user_id=people["admin"], cycle_id=school["cycles"]["lycee"]))
        db.commit()
        assert allowed_cycle_ids(db, tenant_id=tenant, user=director) == frozenset({str(school["cycles"]["lycee"])})
        admin = {"id": str(people["admin"]), "roles": ["TENANT_ADMIN"]}
        assert allowed_cycle_ids(db, tenant_id=tenant, user=admin) is None
        # Rows of one school never restrict the same account elsewhere.
        assert allowed_cycle_ids(db, tenant_id=school["other"], user=director) is None
    assert can_be_cycle_restricted(["DIRECTOR"]) and not can_be_cycle_restricted(["DIRECTOR", "TENANT_ADMIN"])
    assert not can_be_cycle_restricted(["TEACHER"]) and not can_be_cycle_restricted(["PARENT"])


def test_cycle_payload_still_reports_policy_unavailable(school):
    response = client.get("/api/v1/education/cycles/", headers=school["headers"]())
    assert response.status_code == 200
    assert all(item["cycle_policy_available"] is True for item in response.json())


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL composite foreign keys")
def test_database_rejects_a_cross_tenant_cycle_assignment(school):
    from sqlalchemy.exc import IntegrityError
    with SessionLocal() as db:
        db.add(StaffCycleAssignment(tenant_id=school["tenant"], user_id=school["people"]["director"],
                                    cycle_id=school["cycles"]["foreign"]))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL transaction row locks")
def test_concurrent_edits_of_one_account_only_accept_one(school):
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from starlette.requests import Request
    from app.api.v1.endpoints.core.education import StaffCycleChoice, assign_staff_cycles
    barrier = Barrier(2)
    actor = {"id": str(school["people"]["admin"]), "tenant_id": str(school["tenant"]), "roles": ["TENANT_ADMIN"]}

    def save(name):
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout='15s'"))
            barrier.wait(timeout=10)
            try:
                asyncio.run(assign_staff_cycles(
                    school["people"]["director"],
                    StaffCycleChoice(expected_cycle_ids=[], cycle_ids=[school["cycles"][name]]),
                    Request({"type": "http", "headers": []}), db, actor,
                ))
                return 200
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = sorted(pool.map(save, ["college", "lycee"]))
    assert results == [200, 409]
    assert len(_stored(school, "director")) == 1


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL additive migration lifecycle")
def test_migration_reentry_and_noop_downgrade_preserve_restrictions(school):
    import runpy
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    assert _put(school, "director", ["college"]).status_code == 200
    migration = runpy.run_path(
        str(Path(__file__).parents[1] / "alembic/versions/20261116_0001_staff_cycle_assignments.py"))
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            migration["downgrade"]()
            migration["upgrade"]()
    assert _stored(school, "director") == {school["cycles"]["college"]}


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires real PostgreSQL FORCE RLS")
def test_assignment_table_force_rls_hides_other_tenants(school):
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.core.database as database
    with SessionLocal() as db:
        db.add(StaffCycleAssignment(tenant_id=school["tenant"], user_id=school["people"]["director"],
                                    cycle_id=school["cycles"]["college"]))
        db.add(StaffCycleAssignment(tenant_id=school["other"], user_id=school["people"]["foreign_director"],
                                    cycle_id=school["cycles"]["foreign"]))
        db.commit()
    role = "staff_cycle_" + uuid4().hex
    password = "test-only-staff-cycle-password"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" LOGIN PASSWORD \'{password}\' NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{role}"'))
    url = make_url(engine.url.render_as_string(hide_password=False)).set(username=role, password=password)
    restricted_engine = create_engine(url, poolclass=StaticPool)
    restricted = sessionmaker(bind=restricted_engine)
    try:
        with restricted() as db:
            flags = db.execute(text(
                "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='staff_cycle_assignments'::regclass"
            )).one()
            assert flags == (True, True)
            assert db.query(StaffCycleAssignment).count() == 0
            database.switch_tenant_context(db, str(school["tenant"]))
            rows = db.query(StaffCycleAssignment).all()
            assert [row.user_id for row in rows] == [school["people"]["director"]]
            director = {"id": str(school["people"]["director"]), "roles": ["DIRECTOR"]}
            # Even a wrong tenant argument cannot read across the RLS boundary.
            foreign = {"id": str(school["people"]["foreign_director"]), "roles": ["DIRECTOR"]}
            assert allowed_cycle_ids(db, tenant_id=school["other"], user=foreign) is None
            assert allowed_cycle_ids(db, tenant_id=school["tenant"], user=director) == frozenset(
                {str(school["cycles"]["college"])})
    finally:
        restricted_engine.dispose()
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))
