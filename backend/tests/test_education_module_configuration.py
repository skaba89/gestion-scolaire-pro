"""Real JWT/RBAC requests must obey policy changes, including alternate APIs."""
from datetime import date
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core import security  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import EducationConfiguration, Grade, Student, Tenant, User, UserRole  # noqa: E402
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
    from app.models import Level
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
        names = [level.name for level in db.query(Level).filter(Level.tenant_id == tid).order_by(Level.order_index)]
        assert names == guinea_levels_for_type(profile)


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
