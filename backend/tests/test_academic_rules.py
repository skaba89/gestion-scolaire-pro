"""Règles académiques appliquées aux bulletins (2026-11-04).

Avant : la page « Règles académiques » appelait des routes inexistantes (rien
n'était enregistré) et la moyenne de passage / les seuils de mention étaient
écrits en dur, en double, dans school_life.py et transcripts.py. Une route
héritée, POST /school-life/generate-report-card/, fabriquait en outre un
bulletin à partir des NOTES envoyées par le navigateur, sans permission.

Tourne sur SQLite et PostgreSQL (ORM, type GUID).
"""
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.level import Level  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.services.academic_rules import (  # noqa: E402
    DEFAULT_RULES, InvalidRules, effective_rules, is_passing, mention_for, validate_rules,
)

URL = "/api/v1/tenants/settings/academic-rules/"


def _rules(passing=10, ab=12, b=14, tb=16, ex=18) -> dict:
    return {"passing_grade": passing, "mentions": [
        {"label": "Assez Bien", "min": ab}, {"label": "Bien", "min": b},
        {"label": "Très Bien", "min": tb}, {"label": "Excellent", "min": ex}]}


def _old_mention(avg: float) -> str:
    """Table écrite en dur avant ce correctif (school_life.py)."""
    if avg >= 18: return "Excellent"
    if avg >= 16: return "Très Bien"
    if avg >= 14: return "Bien"
    if avg >= 12: return "Assez Bien"
    if avg >= 10: return "Passable"
    return "Insuffisant"


class TestRulesEngine:
    def test_defaults_reproduce_the_previous_hard_coded_table_exactly(self):
        for tenths in range(0, 201):
            avg = tenths / 10
            assert mention_for(avg, DEFAULT_RULES) == _old_mention(avg), avg

    def test_custom_passing_grade_changes_pass_and_mention(self):
        rules = validate_rules(_rules(passing=12, ab=13))
        assert mention_for(11.5, rules) == "Insuffisant"
        assert mention_for(12, rules) == "Passable"
        assert mention_for(13, rules) == "Assez Bien"
        assert is_passing(11.9, rules) is False and is_passing(12, rules) is True

    @pytest.mark.parametrize("bad", [
        _rules(passing=0), _rules(passing=21), _rules(ab=9),           # mention ≤ passage
        _rules(b=12), _rules(ex=20.5), {"passing_grade": "dix", "mentions": []},
        {"passing_grade": 10, "mentions": [{"label": "Génial", "min": 15}]},
    ])
    def test_invalid_rules_are_refused(self, bad):
        with pytest.raises(InvalidRules):
            validate_rules(bad)


def _tenant(settings=None) -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Règles", slug=f"regles-{tid[:8]}", type="primary",
                      country="GN", is_active=True, settings=settings or {}))
        db.commit()
    return tid


def _level(tid: str, name="6e") -> str:
    lid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Level(id=lid, tenant_id=tid, name=name, order_index=1))
        db.commit()
    return lid


class TestEffectiveRules:
    def test_nothing_configured_gives_defaults(self):
        tid = _tenant()
        with SessionLocal() as db:
            assert effective_rules(db, tid) == DEFAULT_RULES

    def test_level_rules_take_precedence_over_school_rules(self):
        tid = _tenant()
        lid = _level(tid)
        with SessionLocal() as db:
            t = db.query(Tenant).filter(Tenant.id == tid).one()
            t.settings = {"academic_rules": {"default": _rules(passing=11), "levels": {lid: _rules(passing=12, ab=13)}}}
            db.commit()
            assert effective_rules(db, tid, lid)["passing_grade"] == 12
            assert effective_rules(db, tid)["passing_grade"] == 11
            assert effective_rules(db, tid, str(uuid.uuid4()))["passing_grade"] == 11

    def test_corrupted_stored_rules_fall_back_to_defaults(self):
        tid = _tenant({"academic_rules": {"default": {"passing_grade": 99}}})
        with SessionLocal() as db:
            assert effective_rules(db, tid) == DEFAULT_RULES


def _as(tid: str, role: str) -> dict:
    uid = str(uuid.uuid4())
    user = {"id": uid, "roles": [role], "tenant_id": tid}
    app.dependency_overrides[get_current_user] = lambda: user
    return {"Authorization": f"Bearer {create_access_token({'sub': uid, 'tenant_id': tid, 'roles': [role]})}"}


@pytest.fixture(autouse=True)
def _clean():
    yield
    app.dependency_overrides.pop(get_current_user, None)


class TestApi:
    def test_admin_saves_and_reads_back_school_and_level_rules(self):
        tid = _tenant()
        lid = _level(tid, "CM2")
        h = _as(tid, "TENANT_ADMIN")
        resp = client.put(URL, json={"default": _rules(passing=11), "levels": {lid: _rules(passing=12, ab=13)}}, headers=h)
        assert resp.status_code == 200, resp.text
        body = client.get(URL, headers=h).json()
        assert body["default"]["passing_grade"] == 11
        assert body["levels"] == [{"level_id": lid, "level_name": "CM2", "rules": validate_rules(_rules(passing=12, ab=13))}]
        assert body["defaults"] == DEFAULT_RULES

    def test_invalid_rules_are_422_and_nothing_is_stored(self):
        tid = _tenant()
        h = _as(tid, "TENANT_ADMIN")
        resp = client.put(URL, json={"default": _rules(b=12)}, headers=h)
        assert resp.status_code == 422, resp.text
        assert "Bien" in resp.json()["detail"]
        assert client.get(URL, headers=h).json()["default"] is None

    def test_level_of_another_school_is_404(self):
        tid, other = _tenant(), _tenant()
        foreign_level = _level(other)
        resp = client.put(URL, json={"levels": {foreign_level: _rules()}}, headers=_as(tid, "TENANT_ADMIN"))
        assert resp.status_code == 404, resp.text

    def test_teacher_can_read_but_not_write(self):
        tid = _tenant()
        h = _as(tid, "TEACHER")
        assert client.get(URL, headers=h).status_code == 200
        assert client.put(URL, json={"default": _rules()}, headers=h).status_code == 403

    def test_generic_settings_patch_cannot_bypass_validation(self):
        tid = _tenant()
        resp = client.patch("/api/v1/tenants/settings/", json={"academic_rules": {"default": {"passing_grade": 99}}},
                            headers=_as(tid, "TENANT_ADMIN"))
        assert resp.status_code == 422, resp.text


class TestBulletinApplication:
    def _bulletin(self, rules, average):
        from app.api.v1.endpoints.operational.school_life import _build_bulletin_v2
        grades = [{"subject_name": "Mathématiques", "score": average, "max_score": 20, "coefficient": 1}]
        return _build_bulletin_v2(rules=rules, school_name="École", student_name="Awa Camara",
                                  grades=grades, general_average=average)

    def test_default_rules_keep_the_previous_mention(self):
        assert "Passable" in self._bulletin(DEFAULT_RULES, 11.0)

    def test_school_passing_grade_is_applied_to_the_report_card(self):
        html = self._bulletin(validate_rules(_rules(passing=12, ab=13)), 11.0)
        assert "Insuffisant" in html and "Passable" not in html


def test_forging_legacy_bulletin_route_is_gone():
    tid = _tenant()
    resp = client.post("/api/v1/school-life/generate-report-card/", json={
        "tenant": {"name": "Lycée Officiel"}, "student": {"firstName": "X", "lastName": "Y"},
        "grades": [{"subject": "Maths", "score": 20, "maxScore": 20}], "average": "20"},
        headers=_as(tid, "STUDENT"))
    assert resp.status_code in (404, 405), resp.text
