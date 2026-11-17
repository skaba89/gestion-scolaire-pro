"""Garde de périmètre par cycle (lot B2a) : refus par défaut + briques de filtrage.

JWT réel, lecture réelle des rôles et des affectations ; seule la révocation
Redis est contrôlée. Les routes de données restent refusées aux comptes
restreints jusqu'aux lots B2c-2 à B2e.
"""
from datetime import date
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from conftest import get_test_client

client = get_test_client()

from app.core import cycle_routes, cycle_scope, security  # noqa: E402
from app.core.cycle_scope import (  # noqa: E402
    allowed_class_ids,
    class_scope_clause,
    needs_cycle_lookup,
    require_class_in_scope,
    require_student_in_scope,
    student_scope_clause,
)
from app.core.database import SessionLocal, switch_tenant_context  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AcademicYear, Classroom, EducationCycle, Enrollment, Level, StaffCycleAssignment,
    Student, Tenant, User, UserRole,
)
from app.models.student import Gender  # noqa: E402

DENIED = "/api/v1/school-life/attendance/"       # route de données refusée jusqu'au lot B2c-2 (vie scolaire)
INDEPENDENT = "/api/v1/users/me/"   # route de coquille
STRUCTURE = "/api/v1/levels/"       # lecture de structure, INDEPENDENT

PEOPLE = {
    "director": ["DIRECTOR"],
    "secretary_free": ["SECRETARY"],
    "secretary": ["SECRETARY"],
    "admin_residual": ["TENANT_ADMIN"],
    "teacher": ["TEACHER"],
    "teacher_residual": ["TEACHER"],
    "director_teacher": ["DIRECTOR", "TEACHER"],
    "student": ["STUDENT"],
    "parent": ["PARENT"],
    "foreign_assigned": ["SECRETARY"],
    "secretary_parent": ["SECRETARY", "PARENT"],
    "superadmin": ["SUPER_ADMIN"],
    "accountant": ["ACCOUNTANT"],
}


@pytest.fixture
def school(monkeypatch):
    app.dependency_overrides.pop(security.get_current_user, None)
    monkeypatch.setattr(security, "_evaluate_revocation", AsyncMock(return_value=True))
    tenant, other = uuid4(), uuid4()
    people = {name: uuid4() for name in PEOPLE}
    cycles = {name: uuid4() for name in ("primaire", "college", "foreign")}
    with SessionLocal() as db:
        for tid in (tenant, other):
            db.add(Tenant(id=tid, name="Groupe scolaire", slug=f"gate-{tid}", type="mixed"))
        db.flush()
        for name, uid in people.items():
            db.add(User(id=uid, tenant_id=None if name == "superadmin" else tenant, email=f"{name}-{uid}@example.gn", username=str(uid),
                        password_hash="x", is_active=True, first_name=name, last_name="Test"))
            db.flush()
            for role in PEOPLE[name]:
                db.add(UserRole(tenant_id=tenant, user_id=uid, role=role))
        for order, (name, cid) in enumerate(cycles.items()):
            db.add(EducationCycle(
                id=cid, tenant_id=other if name == "foreign" else tenant, code=name.upper(), name=name,
                institution_type="primary", period_type="TRIMESTER", order_index=order,
                is_active=True, revision=1,
            ))
        db.flush()

        def assign(who, cycle, owner=tenant):
            db.add(StaffCycleAssignment(tenant_id=owner, user_id=people[who], cycle_id=cycles[cycle]))

        assign("director", "primaire")
        assign("secretary", "primaire")
        assign("admin_residual", "primaire")
        assign("teacher_residual", "primaire")
        assign("director_teacher", "primaire")
        assign("secretary_parent", "primaire")
        assign("accountant", "primaire")
        assign("superadmin", "primaire")  # affectation résiduelle : ne doit jamais s'appliquer
        # Affectation enregistrée sous un autre établissement : ne doit jamais s'appliquer ici.
        assign("foreign_assigned", "foreign", owner=other)
        db.commit()

    def headers(who, **extra):
        owner = None if who == "superadmin" else str(tenant)
        token = security.create_access_token({"sub": str(people[who]), "tenant_id": owner})
        return {"Authorization": f"Bearer {token}", **extra}

    yield dict(tenant=tenant, other=other, people=people, cycles=cycles, headers=headers)
    app.dependency_overrides.pop(security.get_current_user, None)
    with SessionLocal() as db:
        for tid in (tenant, other):
            switch_tenant_context(db, str(tid))
            db.query(StaffCycleAssignment).filter(StaffCycleAssignment.tenant_id == tid).delete()
        db.commit()


def _get(school, who, url, **extra_headers):
    return client.get(url, headers=school["headers"](who, **extra_headers))


def _error_of(response):
    """Code d'erreur d'une réponse (une liste vide, réponse d'une route de données, n'en a pas)."""
    body = response.json()
    return body.get("error") if isinstance(body, dict) else None


def _assert_denied(response):
    assert response.status_code == 403, response.text
    body = response.json()
    assert body["error"] == "CYCLE_SCOPE_DENIED"
    assert "cycles" in body["message"]


# --- Garde -------------------------------------------------------------------

@pytest.mark.parametrize("who", ["director", "secretary", "director_teacher"])
def test_restricted_account_is_denied_on_data_route(school, who):
    _assert_denied(_get(school, who, DENIED))


def test_restricted_account_is_denied_on_unclassified_route_and_write(school):
    # Écriture de structure : refusée (Q4) même si la lecture est autorisée.
    response = client.post(STRUCTURE, headers=school["headers"]("director"), json={"name": "6e"})
    _assert_denied(response)
    # Route absente du registre : repli sur DENY (le gabarit n'est pas classé).
    assert cycle_routes.policy_for("GET", "/api/v1/nouvelle-route/") is cycle_routes.Policy.DENY


@pytest.mark.parametrize("url", [INDEPENDENT, STRUCTURE, "/api/v1/auth/me/"])
def test_restricted_account_keeps_the_application_shell(school, url):
    response = _get(school, "director", url)
    assert response.status_code == 200, response.text


def test_full_route_template_is_resolved_from_a_real_request(school, monkeypatch):
    """Garde-fou : ``scope['route']`` n'a pas le préfixe /api/v1 (FastAPI 0.139) ;
    le gabarit complet doit bien venir du contexte de route effectif."""
    seen = {}

    original = cycle_routes.resolve_route_template

    def spy(request):
        seen["template"] = original(request)
        seen["raw_route"] = getattr(request.scope.get("route"), "path_format", None)
        return seen["template"]

    monkeypatch.setattr(cycle_routes, "resolve_route_template", spy)
    assert _get(school, "director", INDEPENDENT).status_code == 200
    assert seen["template"] == INDEPENDENT
    assert seen["raw_route"] != INDEPENDENT  # prouve que le repli naïf serait faux


def test_unresolvable_route_is_denied_never_allowed(school, monkeypatch):
    monkeypatch.setattr(cycle_routes, "resolve_route_template", lambda request: None)
    _assert_denied(_get(school, "director", INDEPENDENT))


def test_resolve_route_template_returns_none_without_route_information():
    request = Request({"type": "http", "method": "GET", "path": "/x", "headers": []})
    assert cycle_routes.resolve_route_template(request) is None
    legacy = Request({"type": "http", "method": "GET", "path": "/x", "headers": [],
                      "route": type("R", (), {"path_format": "/me/"})()})
    assert cycle_routes.resolve_route_template(legacy) is None  # sans préfixe API : refusé


def test_restrictable_account_without_assignment_is_unchanged(school):
    response = _get(school, "secretary_free", DENIED)
    assert response.status_code == 200, response.text
    assert _get(school, "secretary_free", INDEPENDENT).status_code == 200


def test_teacher_without_assignment_is_unchanged(school):
    response = _get(school, "teacher", INDEPENDENT)
    assert response.status_code == 200
    assert _error_of(_get(school, "teacher", DENIED)) != "CYCLE_SCOPE_DENIED"


def test_admin_with_residual_assignment_is_never_restricted(school):
    response = _get(school, "admin_residual", DENIED)
    assert _error_of(response) != "CYCLE_SCOPE_DENIED"
    assert response.status_code == 200, response.text


def test_residual_assignment_on_teacher_still_restricts_q5(school):
    _assert_denied(_get(school, "teacher_residual", DENIED))
    assert _get(school, "teacher_residual", INDEPENDENT).status_code == 200


def test_assignment_of_another_tenant_never_restricts(school):
    assert _error_of(_get(school, "foreign_assigned", DENIED)) != "CYCLE_SCOPE_DENIED"


def test_unauthorized_role_still_gets_the_rbac_403(school):
    response = _get(school, "teacher", "/api/v1/hr/employees/")
    assert response.status_code == 403
    assert _error_of(response) != "CYCLE_SCOPE_DENIED"
    assert "Permission refusée" in response.json()["message"]


@pytest.mark.parametrize("who", ["student", "parent", "admin_residual"])
def test_no_assignment_query_for_student_parent_admin(school, monkeypatch, who):
    def boom(*args, **kwargs):
        raise AssertionError("aucune requête d'affectation attendue")

    monkeypatch.setattr(cycle_scope, "assigned_cycle_ids", boom)
    assert _get(school, who, INDEPENDENT).status_code == 200


def test_needs_cycle_lookup_matrix():
    assert not needs_cycle_lookup(["SUPER_ADMIN"])
    assert not needs_cycle_lookup(["TENANT_ADMIN", "DIRECTOR"])
    assert not needs_cycle_lookup(["STUDENT"])
    assert not needs_cycle_lookup(["PARENT", "ALUMNI"])
    assert needs_cycle_lookup(["TEACHER"])
    assert needs_cycle_lookup(["DIRECTOR", "TEACHER"])
    assert needs_cycle_lookup(["STUDENT", "SECRETARY"])


@pytest.mark.asyncio
async def test_current_user_carries_the_cycle_scope(school):
    def request_for(who):
        from fastapi import Request as R
        return R({"type": "http", "method": "GET", "path": INDEPENDENT, "headers": [],
                  "route": type("Route", (), {"path_format": INDEPENDENT})()})

    def token_for(who):
        return {"sub": str(school["people"][who]), "tenant_id": str(school["tenant"])}

    restricted = await security.get_current_user(request=request_for("director"), token=token_for("director"))
    assert restricted["_cycle_ids"] == [str(school["cycles"]["primaire"])]
    free = await security.get_current_user(request=request_for("teacher"), token=token_for("teacher"))
    assert free["_cycle_ids"] is None
    admin = await security.get_current_user(request=request_for("admin_residual"), token=token_for("admin_residual"))
    assert admin["_cycle_ids"] is None


# --- Briques de filtrage -----------------------------------------------------

@pytest.fixture
def structure(school):
    t, o = school["tenant"], school["other"]
    ids = {n: uuid4() for n in (
        "year", "old_year", "lvl_cp", "lvl_6e", "lvl_nocycle", "cls_cp", "cls_6e", "cls_nolevel",
        "cls_nocycle", "cls_old", "foreign_year", "foreign_level", "foreign_class",
        "s_cp", "s_6e", "s_nolevel", "s_nocycle", "s_withdrawn", "s_old_only", "s_foreign",
    )}
    with SessionLocal() as db:
        for key, tid, current in (("year", t, True), ("old_year", t, False), ("foreign_year", o, True)):
            db.add(AcademicYear(id=ids[key], tenant_id=tid, name=key, code=f"{key}-{ids[key]}",
                                start_date=date(2025, 9, 1), end_date=date(2026, 6, 30), is_current=current))
        db.add(Level(id=ids["lvl_cp"], tenant_id=t, name="CP", cycle_id=school["cycles"]["primaire"]))
        db.add(Level(id=ids["lvl_6e"], tenant_id=t, name="6e", cycle_id=school["cycles"]["college"]))
        db.add(Level(id=ids["lvl_nocycle"], tenant_id=t, name="Sans cycle", cycle_id=None))
        db.add(Level(id=ids["foreign_level"], tenant_id=o, name="CP", cycle_id=school["cycles"]["foreign"]))
        db.flush()
        for key, tid, level in (
            ("cls_cp", t, "lvl_cp"), ("cls_6e", t, "lvl_6e"), ("cls_nolevel", t, None),
            ("cls_nocycle", t, "lvl_nocycle"), ("cls_old", t, "lvl_cp"), ("foreign_class", o, "foreign_level"),
        ):
            db.add(Classroom(id=ids[key], tenant_id=tid, name=key, level_id=ids[level] if level else None))
        db.flush()
        for key in ("s_cp", "s_6e", "s_nolevel", "s_nocycle", "s_withdrawn", "s_old_only", "s_foreign"):
            db.add(Student(id=ids[key], tenant_id=o if key == "s_foreign" else t, registration_number=f"{key}-{ids[key]}",
                           first_name=key, last_name="Test", date_of_birth=date(2015, 1, 1), gender=Gender.MALE))
        db.flush()

        def enroll(student, klass, year="year", status="ACTIVE", tid=t):
            db.add(Enrollment(tenant_id=tid, student_id=ids[student], class_id=ids[klass],
                              academic_year_id=ids[year], status=status))

        enroll("s_cp", "cls_cp")
        enroll("s_6e", "cls_6e")
        enroll("s_nolevel", "cls_nolevel")
        enroll("s_nocycle", "cls_nocycle")
        enroll("s_withdrawn", "cls_cp", status="WITHDRAWN")
        enroll("s_old_only", "cls_old", year="old_year")
        enroll("s_foreign", "foreign_class", year="foreign_year", tid=o)
        db.commit()
    yield ids
    with SessionLocal() as db:
        for tid in (t, o):
            switch_tenant_context(db, str(tid))
            for model in (Enrollment, Student, Classroom, Level, AcademicYear):
                db.query(model).filter(model.tenant_id == tid).delete()
        db.commit()


def _visible_students(school, structure, cycles, tenant=None):
    tenant = tenant or school["tenant"]
    with SessionLocal() as db:
        class_ids = allowed_class_ids(db, tenant, cycles)
        rows = db.query(Student.id).filter(
            Student.tenant_id == tenant,
            student_scope_clause(Student.id, class_ids, tenant_id=tenant),
        ).all()
    names = {key for key, value in structure.items() if key.startswith("s_")}
    return {key for key in names if any(value == structure[key] for (value,) in rows)}


def test_allowed_class_ids_follow_level_cycle(school, structure):
    with SessionLocal() as db:
        primaire = {str(c) for c in allowed_class_ids(db, school["tenant"], [school["cycles"]["primaire"]])}
        both = {str(c) for c in allowed_class_ids(
            db, school["tenant"], [school["cycles"]["primaire"], school["cycles"]["college"]])}
        assert allowed_class_ids(db, school["tenant"], []) == []
        # Cycle d'un autre établissement : aucune classe de cet établissement.
        assert allowed_class_ids(db, school["tenant"], [school["cycles"]["foreign"]]) == []
    assert primaire == {str(structure["cls_cp"]), str(structure["cls_old"])}
    assert both == primaire | {str(structure["cls_6e"])}


def test_student_scope_keeps_only_active_current_enrollments_of_the_cycle(school, structure):
    assert _visible_students(school, structure, [school["cycles"]["primaire"]]) == {"s_cp"}
    assert _visible_students(school, structure, [school["cycles"]["college"]]) == {"s_6e"}
    # Sans niveau, sans cycle, retiré, ancienne année, autre établissement : jamais visibles.
    both = _visible_students(school, structure, [school["cycles"]["primaire"], school["cycles"]["college"]])
    assert both == {"s_cp", "s_6e"}
    assert _visible_students(school, structure, [school["cycles"]["foreign"]]) == set()


def test_without_current_year_any_active_enrollment_counts(school, structure):
    with SessionLocal() as db:
        db.query(AcademicYear).filter(AcademicYear.id == structure["year"]).update({"is_current": False})
        db.commit()
    assert _visible_students(school, structure, [school["cycles"]["primaire"]]) == {"s_cp", "s_old_only"}


def test_empty_scope_matches_nothing(school, structure):
    with SessionLocal() as db:
        assert db.query(Student.id).filter(
            student_scope_clause(Student.id, [], tenant_id=school["tenant"])).all() == []
        assert db.query(Classroom.id).filter(class_scope_clause(Classroom.id, [])).all() == []


def test_require_helpers_are_noop_for_unrestricted_and_404_out_of_scope(school, structure):
    cp = [str(school["cycles"]["primaire"])]
    restricted = {"_cycle_ids": cp}
    tenant = school["tenant"]
    with SessionLocal() as db:
        require_student_in_scope(db, tenant, {"_cycle_ids": None}, structure["s_6e"])
        require_class_in_scope(db, tenant, {"_cycle_ids": None}, structure["cls_6e"])
        require_student_in_scope(db, tenant, restricted, structure["s_cp"])
        require_class_in_scope(db, tenant, restricted, structure["cls_cp"])
        for student in ("s_6e", "s_nolevel", "s_nocycle", "s_withdrawn", "s_foreign"):
            with pytest.raises(HTTPException) as caught:
                require_student_in_scope(db, tenant, restricted, structure[student])
            assert caught.value.status_code == 404
        for klass in ("cls_6e", "cls_nolevel", "cls_nocycle", "foreign_class"):
            with pytest.raises(HTTPException) as caught:
                require_class_in_scope(db, tenant, restricted, structure[klass])
            assert caught.value.status_code == 404
        with pytest.raises(HTTPException) as caught:
            require_student_in_scope(db, tenant, restricted, uuid4())
        assert caught.value.status_code == 404


# --- Routes de données refusées, en-têtes, HEAD, modules, WebSocket -----------

DATA_ROUTES = [
    "/api/v1/payments/invoices/", "/api/v1/payments/fees/", "/api/v1/students/dashboard/", "/api/v1/invoices/",
    "/api/v1/school-life/attendance/", "/api/v1/notifications/settings/", "/api/v1/teachers/", "/api/v1/school-life/grades/",
    "/api/v1/parents/children/", "/api/v1/parents/dashboard/",
]


@pytest.mark.parametrize("url", DATA_ROUTES)
def test_data_routes_are_denied_to_a_restricted_account(school, url):
    _assert_denied(_get(school, "secretary", url))


@pytest.mark.parametrize("who,url", [
    ("director_teacher", "/api/v1/school-life/grades/"),
    ("director_teacher", "/api/v1/teachers/"),
    ("secretary_parent", "/api/v1/parents/children/"),
    ("secretary_parent", "/api/v1/parents/dashboard/"),
])
def test_multi_role_restricted_account_loses_teacher_and_parent_portals(school, who, url):
    _assert_denied(_get(school, who, url))


@pytest.mark.parametrize("url", ["/api/v1/subjects/", "/api/v1/academic-years/", "/api/v1/terms/"])
def test_more_structure_reads_stay_available(school, url):
    assert _get(school, "secretary", url).status_code == 200


@pytest.mark.asyncio
async def test_super_admin_with_tenant_header_and_residual_assignment_is_never_restricted(school):
    # Intégration : le X-Tenant-ID résout le tenant, l'affectation résiduelle (même tenant) est ignorée.
    request = Request({
        "type": "http", "method": "GET", "path": DENIED,
        "headers": [(b"x-tenant-id", str(school["tenant"]).encode())],
    })
    user = await security.get_current_user(
        request=request, token={"sub": str(school["people"]["superadmin"]), "tenant_id": None},
    )
    assert user["tenant_id"] == str(school["tenant"])
    assert user["_cycle_ids"] is None
    # Et par HTTP : jamais CYCLE_SCOPE_DENIED (un éventuel 400 vient de la résolution de tenant).
    response = _get(school, "superadmin", DENIED, **{"X-Tenant-ID": str(school["tenant"])})
    assert _error_of(response) != "CYCLE_SCOPE_DENIED"


def test_tenant_header_never_widens_a_restricted_account(school):
    response = _get(school, "secretary", DENIED, **{"X-Tenant-ID": str(school["other"])})
    _assert_denied(response)
    # L'en-tête d'un autre établissement ne rend pas non plus l'écriture possible.
    assert _get(school, "secretary", INDEPENDENT, **{"X-Tenant-ID": str(school["other"])}).status_code == 200


def test_head_on_an_independent_route_is_not_a_bypass(school):
    """HEAD n'est pas enregistré par FastAPI pour ces routes GET : 405, et en
    tout cas jamais un passage vers une route de données."""
    response = client.head(INDEPENDENT, headers=school["headers"]("director"))
    assert response.status_code in (403, 405)
    assert cycle_routes.policy_for("HEAD", INDEPENDENT) is cycle_routes.Policy.DENY


def test_disabled_module_is_refused_before_the_cycle_gate(school):
    """Ordre documenté : le contrôle des modules précède la garde de cycle. Un
    compte restreint appelant un module désactivé reçoit le 403 du module
    (message texte), pas CYCLE_SCOPE_DENIED ; module actif : CYCLE_SCOPE_DENIED."""
    from app.models.education_configuration import EducationConfiguration

    with SessionLocal() as db:
        tenant = db.get(Tenant, school["tenant"])
        tenant.education_modules_configured = True
        db.add(EducationConfiguration(tenant_id=tenant.id, profile_id="primary",
                                      overrides={"library": False}, revision=1))
        db.commit()
    try:
        response = _get(school, "director", "/api/v1/library/resources/")
        assert response.status_code == 403
        assert "Module désactivé" in response.json()["message"]
        assert response.json()["error"] != "CYCLE_SCOPE_DENIED"
        _assert_denied(_get(school, "director", DENIED))
    finally:
        with SessionLocal() as db:
            db.query(EducationConfiguration).filter(EducationConfiguration.tenant_id == school["tenant"]).delete()
            db.get(Tenant, school["tenant"]).education_modules_configured = False
            db.commit()


@pytest.mark.parametrize("who", ["director", "student"])
def test_require_helpers_fail_closed_when_cycle_ids_is_missing(school, who):
    with SessionLocal() as db:
        with pytest.raises(RuntimeError):
            require_student_in_scope(db, school["tenant"], {}, uuid4())
        with pytest.raises(RuntimeError):
            require_class_in_scope(db, school["tenant"], {"id": "x"}, uuid4())


# WebSocket : compte restreint refusé (4003), sinon comportement inchangé.

@pytest.fixture
def ws_env(school, monkeypatch):
    import threading
    from app.api.v1.endpoints.core import realtime

    closed = threading.Event()

    class _PubSub:
        async def get_message(self, **kwargs):
            return None

        async def unsubscribe(self, *args):
            return None

        async def aclose(self):
            closed.set()

    async def subscribe(channel):
        return _PubSub()

    async def relay_returns_at_once(websocket, pubsub, *, tenant_id, user_id):
        return None

    monkeypatch.setattr(realtime, "_evaluate_revocation", AsyncMock(return_value=True))
    monkeypatch.setattr(realtime.redis_client, "subscribe", subscribe)
    monkeypatch.setattr(realtime, "_relay_tenant_events", relay_returns_at_once)
    return closed


def _ws_url(school, who):
    token = security.create_access_token({"sub": str(school["people"][who]), "tenant_id": str(school["tenant"])})
    return f"/api/v1/realtime/ws/{school['tenant']}/{school['people'][who]}?token={token}"


@pytest.mark.parametrize("who", ["secretary", "director_teacher", "secretary_parent"])
def test_websocket_refuses_a_restricted_account(school, ws_env, who):
    from starlette.testclient import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as caught:
        with client.websocket_connect(_ws_url(school, who)):
            pass
    assert caught.value.code == 4003


@pytest.mark.parametrize("who", ["secretary_free", "admin_residual", "teacher"])
def test_websocket_accepts_an_unrestricted_account(school, ws_env, who):
    with client.websocket_connect(_ws_url(school, who)):
        assert ws_env.wait(timeout=5)
