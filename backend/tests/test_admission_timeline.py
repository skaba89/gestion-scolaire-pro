"""Suivi de candidature — signalé par un utilisateur : le candidat doit
pouvoir suivre l'évolution de son dossier étape par étape, pas seulement
voir le statut actuel, et l'admin doit avoir une vue d'ensemble du
traitement par étape (déjà le cas côté état de la machine — voir
VALID_TRANSITIONS/AdmissionTable.tsx — mais sans historique visible).

Reconstruit une timeline à partir de audit_logs (déjà journalisé par
transition_status()/convert_to_student(), désormais aussi par
public_apply()) plutôt que d'ajouter une nouvelle table dédiée.

Couvre aussi le vrai bug trouvé en construisant cette fonctionnalité :
`(documents or {}).get("type", ...)` dans public_check_status() plantait
(AttributeError) dès qu'un candidat ayant déposé des pièces jointes
consultait son statut — documents est une LISTE pour une nouvelle
candidature, un DICT pour une réinscription, jamais les deux.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admission import AdmissionApplication, AdmissionStatus  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.api.v1.endpoints.operational.admissions import (  # noqa: E402
    _build_admission_steps, _admission_type_label, _status_from_audit_action,
)

BASE = "/api/v1/admissions"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _as(user: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user.get("tenant_id"), "roles": user.get("roles", [])})
    return {"Authorization": f"Bearer {token}"}


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Timeline Test", slug=f"admission-timeline-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


def _make_application(tenant_id: str, status: AdmissionStatus = AdmissionStatus.SUBMITTED, **overrides) -> str:
    app_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(AdmissionApplication(
            id=app_id, tenant_id=tenant_id,
            student_first_name="Awa", student_last_name="Camara",
            parent_first_name="Mariam", parent_last_name="Camara",
            parent_email="mariam.camara@example.com", parent_phone="+224600000001",
            status=status, submitted_at=datetime.now(timezone.utc),
            **overrides,
        ))
        db.commit()
    return app_id


def _log(tenant_id: str, admission_id: str, action: str, user_id: str = "public", details=None, created_at=None):
    with SessionLocal() as db:
        db.add(AuditLog(
            tenant_id=tenant_id, user_id=user_id, action=action,
            resource_type="ADMISSION", resource_id=admission_id, details=details,
            created_at=created_at or datetime.now(timezone.utc),
        ))
        db.commit()


class TestStatusFromAuditAction:
    def test_regular_transition_actions(self):
        assert _status_from_audit_action("ADMISSION_SUBMITTED") == "SUBMITTED"
        assert _status_from_audit_action("ADMISSION_UNDER_REVIEW") == "UNDER_REVIEW"
        assert _status_from_audit_action("ADMISSION_ACCEPTED") == "ACCEPTED"
        assert _status_from_audit_action("ADMISSION_REJECTED") == "REJECTED"

    def test_convert_action_maps_to_converted_to_student(self):
        # convert_to_student() journalise ADMISSION_CONVERTED, pas
        # ADMISSION_CONVERTED_TO_STUDENT — cas particulier.
        assert _status_from_audit_action("ADMISSION_CONVERTED") == "CONVERTED_TO_STUDENT"

    def test_unrelated_actions_return_none(self):
        assert _status_from_audit_action("ADMISSION_CREATED") is None
        assert _status_from_audit_action("SOME_OTHER_ACTION") is None
        assert _status_from_audit_action("") is None


class TestAdmissionTypeLabel:
    """Le vrai bug : documents est une LISTE (nouvelle candidature) ou un
    DICT (réinscription), jamais les deux — .get() sur une liste plante."""

    def test_list_shaped_documents_does_not_crash(self):
        docs = [{"key": "a", "url": "u", "filename": "f.pdf", "document_type": "birth_certificate"}]
        assert _admission_type_label(docs) == "CANDIDATURE"

    def test_dict_shaped_documents_returns_its_type(self):
        assert _admission_type_label({"type": "REINSCRIPTION", "student_id": "s1"}) == "REINSCRIPTION"

    def test_none_documents_defaults_to_candidature(self):
        assert _admission_type_label(None) == "CANDIDATURE"

    def test_json_encoded_string_is_parsed(self):
        # SELECT text() brut renvoie la chaîne encodée sur SQLite, pas un
        # objet déjà parsé (contrairement à un accès via l'ORM).
        assert _admission_type_label('{"type": "REINSCRIPTION"}') == "REINSCRIPTION"
        assert _admission_type_label('[{"key": "a"}]') == "CANDIDATURE"

    def test_malformed_json_string_does_not_crash(self):
        assert _admission_type_label("not json") == "CANDIDATURE"


class TestBuildAdmissionSteps:
    def test_happy_path_all_reached(self):
        now = datetime.now(timezone.utc)
        reached = {
            "SUBMITTED": now,
            "UNDER_REVIEW": now + timedelta(days=1),
            "ACCEPTED": now + timedelta(days=2),
            "CONVERTED_TO_STUDENT": now + timedelta(days=3),
        }
        steps = _build_admission_steps("CONVERTED_TO_STUDENT", reached)
        assert [s["key"] for s in steps] == ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "CONVERTED_TO_STUDENT"]
        assert all(s["state"] == "done" for s in steps)
        assert all(s["date"] is not None for s in steps)

    def test_current_step_has_no_date_but_is_marked_current(self):
        reached = {"SUBMITTED": datetime.now(timezone.utc)}
        steps = _build_admission_steps("UNDER_REVIEW", reached)
        by_key = {s["key"]: s for s in steps}
        assert by_key["SUBMITTED"]["state"] == "done"
        assert by_key["UNDER_REVIEW"]["state"] == "current"
        assert by_key["ACCEPTED"]["state"] == "pending"
        assert by_key["CONVERTED_TO_STUDENT"]["state"] == "pending"

    def test_rejected_from_under_review_replaces_remaining_steps(self):
        now = datetime.now(timezone.utc)
        reached = {"SUBMITTED": now, "UNDER_REVIEW": now, "REJECTED": now}
        steps = _build_admission_steps("REJECTED", reached)
        keys = [s["key"] for s in steps]
        assert keys == ["SUBMITTED", "UNDER_REVIEW", "REJECTED"]
        assert "ACCEPTED" not in keys
        assert "CONVERTED_TO_STUDENT" not in keys
        assert steps[-1]["state"] == "rejected"

    def test_rejected_directly_from_submitted_shows_under_review_as_pending(self):
        # SUBMITTED -> REJECTED est une transition valide directe (voir
        # VALID_TRANSITIONS) — UNDER_REVIEW n'a jamais été atteint.
        now = datetime.now(timezone.utc)
        reached = {"SUBMITTED": now, "REJECTED": now}
        steps = _build_admission_steps("REJECTED", reached)
        by_key = {s["key"]: s for s in steps}
        assert by_key["UNDER_REVIEW"]["state"] == "pending"
        assert by_key["UNDER_REVIEW"]["date"] is None
        assert steps[-1]["key"] == "REJECTED"


class TestAdmissionTimelineEndpoint:
    def test_requires_auth(self):
        resp = client.get(f"{BASE}/{uuid.uuid4()}/timeline/")
        assert resp.status_code in (401, 403)

    def test_returns_404_for_unknown_application(self):
        tenant_id = _make_tenant()
        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(f"{BASE}/{uuid.uuid4()}/timeline/", headers=headers)
        assert resp.status_code == 404

    def test_falls_back_to_submitted_at_when_no_audit_entry(self):
        # Candidature créée avant l'ajout du log_audit() dans
        # public_apply() : aucune entrée audit_logs pour SUBMITTED, mais
        # submitted_at existe bien sur la ligne elle-même.
        tenant_id = _make_tenant()
        app_id = _make_application(tenant_id, status=AdmissionStatus.SUBMITTED)

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(f"{BASE}/{app_id}/timeline/", headers=headers)
        assert resp.status_code == 200, resp.text
        steps = resp.json()["steps"]
        submitted = next(s for s in steps if s["key"] == "SUBMITTED")
        assert submitted["state"] == "done"
        assert submitted["date"] is not None

    def test_full_history_with_actor_names(self):
        tenant_id = _make_tenant()
        app_id = _make_application(tenant_id, status=AdmissionStatus.ACCEPTED)

        reviewer_id = str(uuid.uuid4())
        with SessionLocal() as db:
            from app.models.user import User
            db.add(User(
                id=reviewer_id, tenant_id=tenant_id, email="reviewer@example.com",
                username="reviewer", first_name="Fatou", last_name="Diallo", is_active=True,
            ))
            db.commit()

        _log(tenant_id, app_id, "ADMISSION_SUBMITTED", user_id="public", details={"to": "SUBMITTED"})
        _log(tenant_id, app_id, "ADMISSION_UNDER_REVIEW", user_id=reviewer_id, details={"from": "SUBMITTED", "to": "UNDER_REVIEW"})
        _log(tenant_id, app_id, "ADMISSION_ACCEPTED", user_id=reviewer_id, details={"from": "UNDER_REVIEW", "to": "ACCEPTED"})

        headers = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id})
        resp = client.get(f"{BASE}/{app_id}/timeline/", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()

        steps = {s["key"]: s for s in body["steps"]}
        assert steps["SUBMITTED"]["state"] == "done"
        assert steps["UNDER_REVIEW"]["state"] == "done"
        assert steps["ACCEPTED"]["state"] == "done"

        events = body["events"]
        assert len(events) == 3
        assert events[0]["actor"] == "Candidat"
        assert events[1]["actor"] == "Fatou Diallo"
        assert events[2]["actor"] == "Fatou Diallo"

    def test_tenant_isolation(self):
        tenant_a = _make_tenant()
        tenant_b = _make_tenant()
        app_id = _make_application(tenant_a)

        headers_b = _as({"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_b})
        resp = client.get(f"{BASE}/{app_id}/timeline/", headers=headers_b)
        assert resp.status_code == 404


class TestPublicStatusIncludesSteps:
    """Le vrai bug (documents polymorphe) + la nouvelle timeline
    publique — exercés ensemble via le chemin HTTP réel."""

    def test_status_check_with_uploaded_documents_does_not_crash(self):
        tenant_id = _make_tenant()
        documents = [{"key": "a", "url": "https://x/a.pdf", "filename": "a.pdf", "document_type": "birth_certificate"}]
        _make_application(tenant_id, documents=documents)

        resp = client.get(f"{BASE}/public/status/", params={"tenant_id": tenant_id, "email": "mariam.camara@example.com"})
        assert resp.status_code == 200, resp.text
        apps = resp.json()["applications"]
        assert len(apps) == 1
        assert apps[0]["type"] == "CANDIDATURE"

    def test_reenrollment_type_still_detected(self):
        tenant_id = _make_tenant()
        _make_application(tenant_id, documents={"type": "REINSCRIPTION", "student_id": "s1"})

        resp = client.get(f"{BASE}/public/status/", params={"tenant_id": tenant_id, "email": "mariam.camara@example.com"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["applications"][0]["type"] == "REINSCRIPTION"

    def test_response_includes_public_safe_steps(self):
        tenant_id = _make_tenant()
        app_id = _make_application(tenant_id, status=AdmissionStatus.UNDER_REVIEW)
        _log(tenant_id, app_id, "ADMISSION_SUBMITTED", details={"to": "SUBMITTED"})
        _log(tenant_id, app_id, "ADMISSION_UNDER_REVIEW", user_id="reviewer-1",
             details={"from": "SUBMITTED", "to": "UNDER_REVIEW", "notes": "Dossier incomplet — bulletin manquant"})

        resp = client.get(f"{BASE}/public/status/", params={"tenant_id": tenant_id, "email": "mariam.camara@example.com"})
        assert resp.status_code == 200, resp.text
        steps = resp.json()["applications"][0]["steps"]
        by_key = {s["key"]: s for s in steps}
        assert by_key["SUBMITTED"]["state"] == "done"
        assert by_key["UNDER_REVIEW"]["state"] == "done"
        assert by_key["ACCEPTED"]["state"] == "pending"

        # Jamais les notes internes d'une transition dans la timeline
        # publique (voir docstring de _admission_events_reached / le
        # commentaire dans public_check_status) — seulement statut + date.
        for step in steps:
            assert "notes" not in step
            assert "actor" not in step
