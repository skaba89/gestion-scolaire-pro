"""Réponses aux messages reçus par les formulaires de contact publics (2026-11-25, Q-C1, Q-C2).

POST /public-pages/submissions/{id}/reply/ : e-mail au visiteur, adresse de réponse = e-mail de
contact publié par l'établissement, historique conservé (SENT / FAILED), échec signalé (502),
isolation par établissement (404), rôles (403), contenu échappé.
"""
import uuid

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.public_form_reply import PublicFormReply  # noqa: E402
from app.models.public_form_submission import PublicFormSubmission  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

SENT: list = []


@pytest.fixture(autouse=True)
def _email(monkeypatch):
    SENT.clear()
    state = {"ok": True}

    def fake_send(self, to, subject, html, text=None, reply_to=None):
        SENT.append({"to": to, "subject": subject, "html": html, "text": text, "reply_to": reply_to,
                     "from_name": self.from_name})
        return state["ok"]

    monkeypatch.setattr("app.services.notifications.EmailSender.send", fake_send)
    yield state
    app.dependency_overrides.pop(get_current_user, None)


def _school(contact_email=None):
    tenant_id = str(uuid.uuid4())
    landing = {"contact_email": contact_email} if contact_email else {}
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="Lycée <b>Kaloum</b>", slug=f"rep-{tenant_id[:8]}", type="high",
                      country="GN", is_active=True, settings={"landing": landing}))
        db.commit()
        author_id = str(uuid.uuid4())
        db.add(User(id=author_id, email=f"dir-{author_id[:8]}@example.gn", username=f"dir-{author_id[:8]}",
                    tenant_id=tenant_id, password_hash="x", first_name="Aïcha", last_name="Camara", is_active=True))
        db.commit()
        submission = PublicFormSubmission(
            tenant_id=tenant_id, name="Mamadou Diallo", email="parent@example.com",
            subject="Inscription en seconde", message="Bonjour, quelles sont les dates <script>x</script> ?",
        )
        db.add(submission)
        db.commit()
        return {"tenant": tenant_id, "author": author_id, "submission": str(submission.id)}


def _as(school, roles):
    user = {"id": school["author"], "tenant_id": school["tenant"], "roles": roles, "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": user["tenant_id"], "roles": roles})
    return {"Authorization": f"Bearer {token}"}


def _reply(school, roles=("DIRECTOR",), message="Bonjour, les inscriptions ouvrent le 1er juin.", submission=None):
    return client.post(f"/api/v1/public-pages/submissions/{submission or school['submission']}/reply/",
                       json={"message": message}, headers=_as(school, list(roles)))


def _replies(school):
    with SessionLocal() as db:
        if engine.dialect.name == "postgresql":
            db.execute(text("SELECT set_config('app.current_tenant_id', :t, false)"), {"t": school["tenant"]})
        return [(r.status, r.body) for r in db.query(PublicFormReply).filter(
            PublicFormReply.submission_id == uuid.UUID(school["submission"]))]


def test_reply_sends_an_email_with_the_published_contact_as_reply_to_and_keeps_the_history():
    school = _school(contact_email="admissions@lycee-kaloum.gn")
    response = _reply(school)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "SENT" and response.json()["author_name"] == "Aïcha Camara"
    [mail] = SENT
    assert mail["to"] == "parent@example.com"
    assert mail["reply_to"] == "admissions@lycee-kaloum.gn"
    assert mail["subject"] == "Re : Inscription en seconde — Lycée <b>Kaloum</b>"
    # Tout est échappé dans le HTML : nom de l'école, message du visiteur.
    assert "<script>" not in mail["html"] and "&lt;script&gt;" in mail["html"]
    assert "<b>Kaloum</b>" not in mail["html"]
    assert _replies(school) == [("SENT", "Bonjour, les inscriptions ouvrent le 1er juin.")]
    listing = client.get("/api/v1/public-pages/submissions/", headers=_as(school, ["DIRECTOR"])).json()
    item = next(i for i in listing if i["id"] == school["submission"])
    assert item["is_read"] is True
    assert [(r["status"], r["author_name"]) for r in item["replies"]] == [("SENT", "Aïcha Camara")]


def test_without_a_published_contact_email_no_reply_to_and_the_visitor_is_told_how_to_answer():
    school = _school()
    assert _reply(school).status_code == 201
    [mail] = SENT
    assert mail["reply_to"] is None
    assert "formulaire de contact" in mail["text"]


def test_a_failed_delivery_is_recorded_and_reported(_email):
    _email["ok"] = False
    school = _school(contact_email="admissions@lycee-kaloum.gn")
    response = _reply(school)
    assert response.status_code == 502
    assert _replies(school) == [("FAILED", "Bonjour, les inscriptions ouvrent le 1er juin.")]


def test_another_schools_message_is_not_found_and_nothing_is_sent():
    school, other = _school(), _school()
    assert _reply(school, submission=other["submission"]).status_code == 404
    assert SENT == [] and _replies(other) == []


@pytest.mark.parametrize("roles", [["TEACHER"], ["STUDENT"], ["PARENT"], ["ACCOUNTANT"]])
def test_roles_without_the_inbox_cannot_reply(roles):
    school = _school()
    assert _reply(school, roles=roles).status_code == 403
    assert SENT == []


def test_an_empty_reply_is_refused():
    school = _school()
    assert _reply(school, message="   ").status_code == 422
    assert SENT == []


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="RLS : PostgreSQL")
def test_reply_table_is_isolated_by_tenant():
    with engine.connect() as conn:
        rls, force = conn.execute(text(
            "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'public_form_replies'")).one()
        policies = conn.execute(text("SELECT count(*) FROM pg_policies WHERE tablename = 'public_form_replies'")).scalar()
    assert rls and force and policies == 1
