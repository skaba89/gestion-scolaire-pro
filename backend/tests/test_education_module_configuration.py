"""Real JWT/RBAC requests must obey policy changes, including alternate APIs."""
from datetime import date
from uuid import UUID, uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core import security  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EducationConfiguration, EducationCycle, Grade, Level, Student, Tenant, User, UserRole  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.library import LibraryResource, LibraryBorrowRecord  # noqa: E402
from app.models.payment import Invoice, Payment  # noqa: E402


@pytest.fixture
def school(monkeypatch):
    # Keep JWT signature, database role lookup, tenant resolution and HTTP
    # dependencies real. Only external Redis revocation is controlled here.
    app.dependency_overrides.pop(security.get_current_user, None)
    monkeypatch.setattr(security, "_evaluate_revocation", AsyncMock(return_value=True))
    tenant, other, admin, teacher = (uuid4() for _ in range(4))
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Modular school", slug=f"modular-{tid}", type="primary"))
        db.flush()
        for uid, role in ((admin, "TENANT_ADMIN"), (teacher, "TEACHER")):
            db.add(User(id=uid, tenant_id=tenant, email=f"{uid}@example.gn", username=str(uid), password_hash="x", is_active=True))
            db.flush()
            db.add(UserRole(tenant_id=tenant, user_id=uid, role=role))
        db.commit()
    def headers(uid=admin):
        token = security.create_access_token({"sub": str(uid), "tenant_id": str(tenant)})
        return {"Authorization": f"Bearer {token}"}
    yield dict(tenant=tenant, other=other, admin=admin, teacher=teacher, headers=headers)
    # Creation tests temporarily grant a platform role to this fixture's
    # administrator. Never leak that grant into unrelated bootstrap fixtures.
    with SessionLocal() as db:
        db.query(UserRole).filter(UserRole.user_id == admin, UserRole.role == "SUPER_ADMIN").delete()
        db.commit()
    app.dependency_overrides.pop(security.get_current_user, None)


def _save(s, overrides=None, profile="primary", revision=0):
    return client.put("/api/v1/education/configuration/", headers=s["headers"](), json={
        "profile_id": profile, "overrides": overrides or {}, "expected_revision": revision,
    })


def test_legacy_policy_is_not_implicitly_replaced_and_preview_is_read_only(school):
    before = client.get("/api/v1/education/configuration/", headers=school["headers"]())
    assert before.status_code == 200, before.text
    assert before.json()["mode"] == "legacy" and "lmd" in before.json()["enabled_modules"]
    preview = client.post("/api/v1/education/preview/", headers=school["headers"](), json={
        "profile_id": "primary", "overrides": {"library": False}, "expected_revision": 0,
    })
    assert preview.status_code == 200, preview.text
    assert "library" in preview.json()["removed"] and "lmd" in preview.json()["removed"]
    with SessionLocal() as db:
        assert db.get(EducationConfiguration, school["tenant"]) is None
        assert db.get(Tenant, school["tenant"]).education_modules_configured is False


@pytest.mark.parametrize("path", ["/library/categories/", "/library/resources/"])
def test_disabling_a_module_blocks_get_and_post_but_reactivation_restores_access(school, path):
    saved = _save(school, {"library": False})
    assert saved.status_code == 200, saved.text
    for response in (client.get("/api/v1"+path, headers=school["headers"]()),
                     client.post("/api/v1"+path, headers=school["headers"](), json={"name": "Sciences", "title": "Sciences"})):
        assert response.status_code == 403, response.text
        assert "library" in response.json()["detail"]
    assert _save(school, {"library": True}, revision=1).status_code == 200
    response = client.get("/api/v1"+path, headers=school["headers"]())
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("path", ["/analytics/elearning/courses/", "/me/elearning/courses/", "/courses/", "/course-discussions/", "/quiz-questions/"])
def test_elearning_canonical_and_alias_paths_cannot_bypass_a_disabled_module(school, path):
    assert _save(school, {"elearning": False}).status_code == 200
    response = client.get("/api/v1"+path, headers=school["headers"]())
    assert response.status_code == 403, response.text
    assert "elearning" in response.json()["detail"]


def test_disabled_public_admissions_reject_status_and_applications(school):
    assert _save(school, {"admissions": False}).status_code == 200
    status = client.get("/api/v1/admissions/public/status/", params={"tenant_id": str(school["tenant"]), "email": "parent@example.gn"})
    apply = client.post("/api/v1/admissions/public/apply/", json={
        "tenant_id": str(school["tenant"]), "student_first_name": "Aminata", "student_last_name": "Camara",
        "parent_first_name": "Moussa", "parent_last_name": "Camara", "parent_email": "parent@example.gn", "parent_phone": "+224600000000",
    })
    assert status.status_code == apply.status_code == 403


@pytest.mark.parametrize("overrides", [{"finance": False}, {"library": "false"}, {"unknown": True}, {"competencies": True}, {"assessments": False}])
def test_invalid_or_dependency_breaking_policy_never_partially_applies(school, overrides):
    profile = "university" if "assessments" in overrides else "primary"
    response = _save(school, overrides, profile=profile)
    assert response.status_code == 422, response.text
    with SessionLocal() as db:
        assert db.get(EducationConfiguration, school["tenant"]) is None
        assert not db.get(Tenant, school["tenant"]).education_modules_configured


def test_stale_configuration_has_no_side_effect_and_generic_settings_cannot_disable_security(school):
    assert _save(school, {"library": False}).status_code == 200
    assert _save(school, {"library": True}, revision=0).status_code == 409
    injected = client.put("/api/v1/education/configuration/", headers=school["headers"](), json={
        "tenant_id": str(school["other"]), "profile_id": "primary", "expected_revision": 1,
    })
    assert injected.status_code == 422
    changed = client.patch(f"/api/v1/tenants/{school['tenant']}/", headers=school["headers"](),
                           json={"settings": {"education_modules_configured": False}})
    assert changed.status_code == 200, changed.text
    assert client.get("/api/v1/library/categories/", headers=school["headers"]()).status_code == 403
    assert client.patch(f"/api/v1/tenants/{school['tenant']}/", headers=school["headers"](),
                        json={"education_modules_configured": False}).status_code == 400
    assert client.patch(f"/api/v1/tenants/{school['tenant']}/", headers=school["headers"](),
                        json={"type": "university"}).status_code == 409


def test_enabled_modules_do_not_grant_roles_and_foreign_tenant_header_is_not_an_authority(school):
    assert _save(school).status_code == 200
    denied = client.put("/api/v1/education/configuration/", headers=school["headers"](school["teacher"]),
                        json={"profile_id": "university", "expected_revision": 1})
    assert denied.status_code == 403
    assert client.get("/api/v1/hr/employees/", headers=school["headers"](school["teacher"])).status_code == 403
    headers = {**school["headers"](), "X-Tenant-ID": str(school["other"])}
    result = client.get("/api/v1/education/configuration/", headers=headers)
    assert result.status_code in (200, 403)
    if result.status_code == 200:
        assert result.json()["tenant_id"] == str(school["tenant"])
    with SessionLocal() as db:
        assert db.get(EducationConfiguration, school["other"]) is None


def test_disabling_and_changing_profile_preserves_teaching_financial_and_library_history(school):
    sid, gid, iid, pid, rid, bid = (uuid4() for _ in range(6))
    with SessionLocal() as db:
        db.add(Student(id=sid, tenant_id=school["tenant"], registration_number=str(sid), first_name="Fanta", last_name="Diallo",
                       gender="FEMALE", date_of_birth=date(2012, 1, 1)))
        db.flush()
        db.add(Grade(id=gid, tenant_id=school["tenant"], student_id=sid, score=14, max_score=20))
        db.add(Invoice(id=iid, tenant_id=school["tenant"], student_id=sid, invoice_number=str(iid), subtotal=100000,
                       total_amount=100000, paid_amount=50000, issue_date=date(2026, 1, 1), due_date=date(2026, 2, 1)))
        db.add(LibraryResource(id=rid, tenant_id=school["tenant"], title="Mathématiques"))
        db.flush()
        db.add(Payment(id=pid, tenant_id=school["tenant"], student_id=sid, invoice_id=iid, amount=50000,
                       payment_method="CASH", status="REVERSED", payment_date=date(2026, 1, 2)))
        db.add(LibraryBorrowRecord(id=bid, tenant_id=school["tenant"], resource_id=rid, borrowed_by=school["teacher"], status="BORROWED"))
        db.commit()
    assert _save(school, {"library": False}, profile="preschool").status_code == 200
    assert _save(school, {"library": True}, profile="university", revision=1).status_code == 200
    with SessionLocal() as db:
        assert db.get(Student, sid).first_name == "Fanta"
        assert db.get(Grade, gid).score == 14
        assert db.get(Invoice, iid).paid_amount == 50000
        assert db.get(Payment, pid).invoice_id == iid
        assert db.get(LibraryResource, rid).title == "Mathématiques"
        assert db.get(LibraryBorrowRecord, bid).resource_id == rid
        assert db.get(User, school["teacher"]) is not None


def test_lmd_fields_cannot_reactivate_credits_via_the_shared_subject_api(school):
    assert _save(school).status_code == 200  # primary profile has no LMD
    denied = client.post("/api/v1/subjects/", headers=school["headers"](), json={"name": "UE interdite", "ects": 6})
    assert denied.status_code == 403, denied.text
    allowed = client.post("/api/v1/subjects/", headers=school["headers"](), json={"name": "Français", "ects": 0})
    assert allowed.status_code == 201, allowed.text


def test_corrupt_config_fails_closed_without_leaking_sql(school):
    assert _save(school).status_code == 200
    with SessionLocal() as db:
        db.get(EducationConfiguration, school["tenant"]).profile_id = "missing-profile"
        db.commit()
    response = client.get("/api/v1/library/categories/", headers=school["headers"]())
    assert response.status_code == 503, response.text
    assert "SELECT" not in response.json()["detail"]


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL transaction row locks")
def test_concurrent_initial_configuration_only_accepts_one_expected_revision(school):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from starlette.requests import Request
    from app.api.v1.endpoints.core.education import ConfigurationChoice, write_configuration
    barrier = Barrier(2)
    actor = {"id": str(school["admin"]), "tenant_id": str(school["tenant"]), "roles": ["TENANT_ADMIN"]}
    def save(active):
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout='15s'"))
            barrier.wait(timeout=10)
            try:
                return write_configuration(ConfigurationChoice(profile_id="primary", overrides={"library": active}, expected_revision=0),
                                           Request({"type": "http", "headers": []}), db, actor)["revision"]
            except HTTPException as exc:
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, [False, True]))
    assert sorted(results) == [1, 409]
    with SessionLocal() as db:
        assert db.get(EducationConfiguration, school["tenant"]).revision == 1


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires real PostgreSQL FORCE RLS")
def test_policy_table_and_real_http_requests_are_isolated_under_non_bypass_rls(school, monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.core.database as database
    assert _save(school, {"library": False}).status_code == 200
    with SessionLocal() as db:
        other = db.get(Tenant, school["other"])
        other.education_modules_configured = True
        db.add(EducationConfiguration(tenant_id=other.id, profile_id="university", overrides={}, revision=1))
        db.commit()
    role = "education_policy_" + uuid4().hex
    password = "test-only-module-policy-password"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" LOGIN PASSWORD \'{password}\' NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{role}"'))
    url = make_url(engine.url.render_as_string(hide_password=False)).set(username=role, password=password)
    restricted_engine = create_engine(url, poolclass=StaticPool)
    restricted = sessionmaker(bind=restricted_engine)
    try:
        with restricted() as db:
            assert db.execute(text("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).one() == (False, False)
            assert db.execute(text("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='education_configurations'::regclass")).one() == (True, True)
            assert db.query(EducationConfiguration).count() == 0
            database.switch_tenant_context(db, str(school["tenant"]))
            assert [c.tenant_id for c in db.query(EducationConfiguration).all()] == [school["tenant"]]
            assert db.get(EducationConfiguration, school["other"]) is None
            with pytest.raises(SQLAlchemyError) as exc:
                db.execute(text("INSERT INTO education_configurations (tenant_id,profile_id,overrides,revision) VALUES (:tid,'primary','{}',1)"),
                           {"tid": school["other"]})
            assert exc.value.orig.sqlstate == "42501"
            db.rollback()
        monkeypatch.setattr(database, "SessionLocal", restricted)
        config = client.get("/api/v1/education/configuration/", headers=school["headers"]())
        assert config.status_code == 200, config.text
        assert config.json()["tenant_id"] == str(school["tenant"])
        assert client.get("/api/v1/library/categories/", headers=school["headers"]()).status_code == 403
    finally:
        restricted_engine.dispose()
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))


@pytest.mark.parametrize("profile", ["preschool", "higher_education", "vocational", "mixed"])
def test_new_institution_types_initialize_one_policy_and_their_own_levels(school, profile):
    from app.core.guinea_presets import guinea_levels_for_type
    with SessionLocal() as db:
        db.add(UserRole(user_id=school["admin"], tenant_id=school["tenant"], role="SUPER_ADMIN"))
        db.commit()
    response = client.post("/api/v1/tenants/", headers=school["headers"](), json={
        "name": "Nouvel établissement", "slug": f"creation-{uuid4().hex}", "type": profile,
    })
    assert response.status_code == 201, response.text
    tid = response.json()["id"]
    with SessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.id == tid).one()
        configuration = db.query(EducationConfiguration).filter(EducationConfiguration.tenant_id == tid).one()
        assert tenant.education_modules_configured and configuration.revision == 1
        assert configuration.profile_id == profile
        cycles = db.query(EducationCycle).filter(EducationCycle.tenant_id == tid).all()
        assert len(cycles) == (0 if profile == "mixed" else 1)
        levels = db.query(Level).filter(Level.tenant_id == tid).order_by(Level.order_index).all()
        names = [level.name for level in levels]
        assert names == guinea_levels_for_type(profile)
        if cycles:
            assert cycles[0].institution_type == profile
            assert all(level.cycle_id == cycles[0].id for level in levels)


def test_cycle_configuration_is_versioned_audited_and_archival_preserves_level_history(school):
    first, second = uuid4(), uuid4()
    with SessionLocal() as db:
        db.add_all([
            Level(id=first, tenant_id=school["tenant"], name="7e année", order_index=1),
            Level(id=second, tenant_id=school["tenant"], name="8e année", order_index=2),
        ])
        db.commit()
    created = client.post("/api/v1/education/cycles/", headers=school["headers"](), json={
        "code": "college", "name": "Collège", "institution_type": "middle",
        "period_type": "TRIMESTER", "order_index": 2,
    })
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["code"] == "COLLEGE" and cycle["revision"] == 1
    assert cycle["level_ids"] == [] and cycle["cycle_policy_available"] is False

    assigned = client.put(
        f"/api/v1/education/cycles/{cycle['id']}/levels/",
        headers=school["headers"](),
        json={"expected_revision": 1, "level_ids": [str(first), str(second)]},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["revision"] == 2
    assert set(assigned.json()["level_ids"]) == {str(first), str(second)}

    archived = client.patch(
        f"/api/v1/education/cycles/{cycle['id']}/",
        headers=school["headers"](),
        json={"expected_revision": 2, "is_active": False},
    )
    assert archived.status_code == 200, archived.text
    assert archived.json()["is_active"] is False and archived.json()["revision"] == 3
    refused = client.put(
        f"/api/v1/education/cycles/{cycle['id']}/levels/",
        headers=school["headers"](),
        json={"expected_revision": 3, "level_ids": []},
    )
    assert refused.status_code == 409
    with SessionLocal() as db:
        assert db.get(Level, first).cycle_id == UUID(cycle["id"])
        assert db.get(Level, second).cycle_id == UUID(cycle["id"])
        actions = {
            action for (action,) in db.query(AuditLog.action).filter(
                AuditLog.tenant_id == school["tenant"],
                AuditLog.resource_id == cycle["id"],
            ).all()
        }
        assert actions == {
            "CREATE_EDUCATION_CYCLE", "ASSIGN_EDUCATION_CYCLE_LEVELS", "UPDATE_EDUCATION_CYCLE",
        }


def test_cycle_assignment_rejects_foreign_or_already_assigned_levels_and_stale_revisions(school):
    own, foreign = uuid4(), uuid4()
    with SessionLocal() as db:
        db.add(Level(id=own, tenant_id=school["tenant"], name="Terminale"))
        db.add(Level(id=foreign, tenant_id=school["other"], name="Licence 1"))
        db.commit()
    payload = {"name": "Cycle A", "institution_type": "high", "period_type": "TRIMESTER"}
    first = client.post("/api/v1/education/cycles/", headers=school["headers"](), json={"code": "A", **payload})
    second = client.post("/api/v1/education/cycles/", headers=school["headers"](), json={"code": "B", **payload})
    assert first.status_code == second.status_code == 201
    first_id, second_id = first.json()["id"], second.json()["id"]
    foreign_result = client.put(
        f"/api/v1/education/cycles/{first_id}/levels/", headers=school["headers"](),
        json={"expected_revision": 1, "level_ids": [str(foreign)]},
    )
    assert foreign_result.status_code == 422
    assert client.put(
        f"/api/v1/education/cycles/{first_id}/levels/", headers=school["headers"](),
        json={"expected_revision": 1, "level_ids": [str(own)]},
    ).status_code == 200
    conflict = client.put(
        f"/api/v1/education/cycles/{second_id}/levels/", headers=school["headers"](),
        json={"expected_revision": 1, "level_ids": [str(own)]},
    )
    assert conflict.status_code == 409
    stale = client.patch(
        f"/api/v1/education/cycles/{first_id}/", headers=school["headers"](),
        json={"expected_revision": 1, "name": "Révision perdue"},
    )
    assert stale.status_code == 409
    with SessionLocal() as db:
        assert db.get(Level, own).cycle_id == UUID(first_id)


def test_cycle_writes_require_tenant_admin_and_never_accept_a_nested_mixed_profile(school):
    denied = client.post("/api/v1/education/cycles/", headers=school["headers"](school["teacher"]), json={
        "code": "P", "name": "Primaire", "institution_type": "primary", "period_type": "TRIMESTER",
    })
    assert denied.status_code == 403
    invalid = client.post("/api/v1/education/cycles/", headers=school["headers"](), json={
        "code": "MIX", "name": "Mixte imbriqué", "institution_type": "mixed", "period_type": "CUSTOM",
    })
    assert invalid.status_code == 422
    assert client.get("/api/v1/education/cycles/", headers=school["headers"]()).json() == []


def test_cycle_creation_rolls_back_when_mandatory_audit_is_unavailable(school):
    from sqlalchemy import event
    from sqlalchemy.exc import SQLAlchemyError

    def refuse_audit(mapper, connection, target):
        if target.action == "CREATE_EDUCATION_CYCLE":
            raise SQLAlchemyError("simulated unavailable audit")

    event.listen(AuditLog, "before_insert", refuse_audit)
    try:
        response = client.post("/api/v1/education/cycles/", headers=school["headers"](), json={
            "code": "AUDIT", "name": "Audit requis", "institution_type": "primary",
            "period_type": "TRIMESTER",
        })
        assert response.status_code == 503, response.text
        with SessionLocal() as db:
            assert db.query(EducationCycle).filter(EducationCycle.tenant_id == school["tenant"]).count() == 0
    finally:
        event.remove(AuditLog, "before_insert", refuse_audit)


def test_public_upload_is_denied_before_reading_or_storing_a_file(school):
    assert _save(school, {"admissions": False}).status_code == 200
    response = client.post("/api/v1/admissions/public/upload-document/", data={"tenant_id": str(school["tenant"]), "document_type": "birth_certificate"},
                           files={"file": ("birth.pdf", b"%PDF-1.4 test", "application/pdf")})
    assert response.status_code == 403, response.text


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Kiosk schema requires PostgreSQL migrations")
def test_existing_device_cannot_scan_after_module_is_disabled(school):
    created = client.post("/api/v1/kiosk/devices/", headers=school["headers"](), json={"label": "Entrée"})
    assert created.status_code == 201, created.text
    token = created.json()["token"]
    assert _save(school, {"attendance": False}).status_code == 200
    scan = client.post("/api/v1/kiosk/scan/", headers={"X-Kiosk-Token": token}, json={"qr_payload": "nonexistent"})
    assert scan.status_code == 403, scan.text
    assert "attendance" in scan.json()["detail"]


@pytest.mark.parametrize("import_type", ["student", "parent", "teacher"])
def test_queued_import_service_rechecks_current_policy_before_writing(school, import_type):
    from importlib import import_module
    from app.core.education_catalog import PROFILES, MODULES
    overrides = {id: False for id in PROFILES["primary"].default_modules if id == "academics" or "academics" in MODULES[id].dependencies}
    assert _save(school, overrides).status_code == 200
    service = getattr(import_module(f"app.services.{import_type}_import"), f"run_{import_type}_import")
    with SessionLocal() as db:
        before = db.query(User).filter(User.tenant_id == school["tenant"]).count()
        with pytest.raises(HTTPException) as exc:
            kwargs = {"default_academic_year": "2026-2027"} if import_type == "student" else {}
            service(db, str(school["tenant"]), [], [], skip_errors=False, **kwargs)
        assert exc.value.status_code == 403
        assert db.query(User).filter(User.tenant_id == school["tenant"]).count() == before


def test_audit_failure_rolls_back_the_entire_configuration(school):
    from sqlalchemy import event
    from sqlalchemy.exc import SQLAlchemyError
    from app.models.audit_log import AuditLog
    def refuse_audit(mapper, connection, target):
        if target.action == "CONFIGURE_EDUCATION_MODULES":
            raise SQLAlchemyError("simulated unavailable audit")
    event.listen(AuditLog, "before_insert", refuse_audit)
    try:
        response = _save(school, {"library": False})
        assert response.status_code == 503, response.text
        with SessionLocal() as db:
            assert db.get(EducationConfiguration, school["tenant"]) is None
            assert not db.get(Tenant, school["tenant"]).education_modules_configured
    finally:
        event.remove(AuditLog, "before_insert", refuse_audit)


@pytest.mark.parametrize("corrupt", [None, [], False, ["library"]])
def test_corrupt_json_policy_never_becomes_an_implicit_default(school, corrupt):
    assert _save(school, {"library": False}).status_code == 200
    with SessionLocal() as db:
        config = db.get(EducationConfiguration, school["tenant"])
        config.overrides = corrupt
        db.commit()
    response = client.get("/api/v1/library/resources/", headers=school["headers"]())
    assert response.status_code == 503, response.text


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL additive migration lifecycle")
def test_migration_reentry_and_non_destructive_downgrade_preserve_policy_and_audit(school):
    import runpy
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.models.audit_log import AuditLog
    assert _save(school, {"library": False}).status_code == 200
    migration = runpy.run_path(str(Path(__file__).parents[1] / "alembic/versions/20261114_0002_education_module_configuration.py"))
    with SessionLocal() as db:
        before = db.query(AuditLog).filter(AuditLog.tenant_id == school["tenant"]).count()
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            migration["downgrade"]()
            migration["upgrade"]()
    with SessionLocal() as db:
        config = db.get(EducationConfiguration, school["tenant"])
        assert config.revision == 1 and config.overrides == {"library": False}
        assert db.get(Tenant, school["tenant"]).education_modules_configured
        assert db.query(AuditLog).filter(AuditLog.tenant_id == school["tenant"]).count() == before
    assert client.get("/api/v1/library/resources/", headers=school["headers"]()).status_code == 403


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL composite foreign keys")
def test_database_rejects_a_cross_tenant_cycle_reference(school):
    from sqlalchemy.exc import IntegrityError
    cycle_id, level_id = uuid4(), uuid4()
    with SessionLocal() as db:
        db.add(EducationCycle(
            id=cycle_id, tenant_id=school["tenant"], code="DB-BOUNDARY", name="Boundary",
            institution_type="primary", period_type="TRIMESTER", revision=1,
        ))
        db.commit()
    with SessionLocal() as db:
        db.add(Level(id=level_id, tenant_id=school["other"], name="Foreign", cycle_id=cycle_id))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        assert db.get(Level, level_id) is None


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL transaction row locks")
def test_concurrent_cycle_updates_only_accept_one_revision(school):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from starlette.requests import Request
    from app.api.v1.endpoints.core.education import CycleUpdate, update_cycle
    cycle_id = uuid4()
    with SessionLocal() as db:
        db.add(EducationCycle(
            id=cycle_id, tenant_id=school["tenant"], code="LOCK", name="Initial",
            institution_type="primary", period_type="TRIMESTER", revision=1,
        ))
        db.commit()
    barrier = Barrier(2)
    actor = {"id": str(school["admin"]), "tenant_id": str(school["tenant"]), "roles": ["TENANT_ADMIN"]}

    def save(name):
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout='15s'"))
            barrier.wait(timeout=10)
            try:
                return update_cycle(
                    cycle_id, CycleUpdate(expected_revision=1, name=name),
                    Request({"type": "http", "headers": []}), db, actor,
                )["revision"]
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ["Premier", "Second"]))
    assert sorted(results) == [2, 409]
    with SessionLocal() as db:
        assert db.get(EducationCycle, cycle_id).revision == 2


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="PostgreSQL additive migration lifecycle")
def test_cycle_migration_reentry_and_noop_downgrade_preserve_assignments(school):
    import runpy
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    cycle_id, level_id = uuid4(), uuid4()
    with SessionLocal() as db:
        db.add(EducationCycle(
            id=cycle_id, tenant_id=school["tenant"], code="HISTORY", name="Historique",
            institution_type="middle", period_type="TRIMESTER", revision=3, is_active=False,
        ))
        db.add(Level(id=level_id, tenant_id=school["tenant"], name="9e année", cycle_id=cycle_id))
        db.commit()
    migration = runpy.run_path(str(Path(__file__).parents[1] / "alembic/versions/20261114_0003_education_cycles.py"))
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            migration["downgrade"]()
            migration["upgrade"]()
    with SessionLocal() as db:
        assert db.get(EducationCycle, cycle_id).revision == 3
        assert db.get(EducationCycle, cycle_id).is_active is False
        assert db.get(Level, level_id).cycle_id == cycle_id


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires real PostgreSQL FORCE RLS")
def test_cycle_table_force_rls_hides_other_tenants(school):
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.core.database as database
    own_cycle, other_cycle = uuid4(), uuid4()
    with SessionLocal() as db:
        db.add_all([
            EducationCycle(id=own_cycle, tenant_id=school["tenant"], code="OWN", name="Own", institution_type="primary", period_type="TRIMESTER"),
            EducationCycle(id=other_cycle, tenant_id=school["other"], code="OTHER", name="Other", institution_type="university", period_type="SEMESTER"),
        ])
        db.commit()
    role = "education_cycle_" + uuid4().hex
    password = "test-only-cycle-policy-password"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE ROLE "{role}" LOGIN PASSWORD \'{password}\' NOSUPERUSER NOBYPASSRLS'))
        conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{role}"'))
    url = make_url(engine.url.render_as_string(hide_password=False)).set(username=role, password=password)
    restricted_engine = create_engine(url, poolclass=StaticPool)
    restricted = sessionmaker(bind=restricted_engine)
    try:
        with restricted() as db:
            flags = db.execute(text("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='education_cycles'::regclass")).one()
            assert flags == (True, True)
            assert db.query(EducationCycle).count() == 0
            database.switch_tenant_context(db, str(school["tenant"]))
            assert [cycle.id for cycle in db.query(EducationCycle).all()] == [own_cycle]
            assert db.get(EducationCycle, other_cycle) is None
    finally:
        restricted_engine.dispose()
        with engine.begin() as conn:
            conn.execute(text(f'DROP OWNED BY "{role}"'))
            conn.execute(text(f'DROP ROLE "{role}"'))
