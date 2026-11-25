"""E-mails d'admission (2026-11-25) : accusé de réception, dossier accepté ou refusé.

- les routes mettent l'e-mail en file APRÈS l'enregistrement, sans bloquer la réponse ; une file
  indisponible est journalisée et la candidature reste enregistrée (PostgreSQL : SQL brut) ;
- la tâche construit un e-mail correct (destinataire, adresse de réponse, contenu échappé, aucune
  note interne) et trace son résultat dans `jobs` (FAILED si l'envoi échoue).
"""
import asyncio
import logging
import uuid

import pytest
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admission import AdmissionApplication, AdmissionStatus  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.workers.tasks import build_admission_email, send_admission_email  # noqa: E402

needs_postgres = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="SQL brut PostgreSQL")
QUEUED: list = []
CREATED_TENANTS: list = []


@pytest.fixture(autouse=True)
def _cleanup():
    """Supprime dossiers, comptes et établissements créés : un compte relecteur encore référencé par
    un dossier ferait échouer les tests qui vident `users` (ex. test_bootstrap)."""
    yield
    from sqlalchemy import text

    with engine.begin() as conn:
        for tenant_id in CREATED_TENANTS:
            conn.execute(text("DELETE FROM admission_applications WHERE tenant_id = :t"), {"t": tenant_id})
            conn.execute(text("DELETE FROM audit_logs WHERE tenant_id = :t"), {"t": tenant_id})
            conn.execute(text("DELETE FROM jobs WHERE tenant_id = :t"), {"t": tenant_id})
            conn.execute(text("DELETE FROM users WHERE tenant_id = :t"), {"t": tenant_id})
            conn.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tenant_id})
    CREATED_TENANTS.clear()


@pytest.fixture(autouse=True)
def _queue(monkeypatch):
    QUEUED.clear()

    async def fake_enqueue(name, **kwargs):
        QUEUED.append((name, kwargs))
        return "job-1"

    monkeypatch.setattr("app.core.jobs.enqueue_job", fake_enqueue)
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _school(contact_email="admissions@lycee.gn"):
    tenant_id = str(uuid.uuid4())
    landing = {"contact_email": contact_email} if contact_email else {}
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="Lycée <i>Kaloum</i>", slug=f"adm-{tenant_id[:8]}", type="high",
                      country="GN", is_active=True, settings={"landing": landing}))
        db.commit()
    CREATED_TENANTS.append(tenant_id)
    return tenant_id


def _application(tenant_id, status=AdmissionStatus.SUBMITTED, parent_email="parent@example.com", documents=None):
    with SessionLocal() as db:
        application = AdmissionApplication(
            id=uuid.uuid4(), tenant_id=tenant_id, status=status, student_first_name="Kadiatou",
            student_last_name="<b>Bah</b>", parent_first_name="Ousmane", parent_last_name="Bah",
            parent_email=parent_email, parent_phone="+224620000000",
            notes="NOTE INTERNE : dossier incomplet", documents=documents,
        )
        db.add(application)
        db.commit()
        return str(application.id)


def _as_admin(tenant_id):
    from app.models.user import User

    user_id = str(uuid.uuid4())
    with SessionLocal() as db:  # relecteur réel : reviewed_by référence users
        db.add(User(id=user_id, email=f"adm-{user_id[:8]}@example.gn", username=f"adm-{user_id[:8]}",
                    tenant_id=tenant_id, password_hash="x", is_active=True))
        db.commit()
    user = {"id": user_id, "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"], "_cycle_ids": None}
    app.dependency_overrides[get_current_user] = lambda: user
    token = create_access_token({"sub": user["id"], "tenant_id": tenant_id, "roles": ["TENANT_ADMIN"]})
    return {"Authorization": f"Bearer {token}"}


# --- Routes : mise en file -----------------------------------------------------------------------

@needs_postgres
def test_public_application_queues_a_receipt():
    tenant_id = _school()
    response = client.post("/api/v1/admissions/public/apply/", json={
        "tenant_id": tenant_id, "student_first_name": "Aïssatou", "student_last_name": "Diallo",
        "parent_first_name": "Mamadou", "parent_last_name": "Diallo", "parent_email": "m.diallo@example.com",
        "parent_phone": "+224621000000",
    })
    assert response.status_code == 201, response.text
    assert QUEUED == [("send_admission_email", {"tenant_id": tenant_id, "application_id": response.json()["id"],
                                                "kind": "RECEIVED"})]


@needs_postgres
def test_an_unavailable_queue_never_loses_the_application(monkeypatch, caplog):
    async def broken(name, **kwargs):
        raise ConnectionError("redis down")

    monkeypatch.setattr("app.core.jobs.enqueue_job", broken)
    tenant_id = _school()
    with caplog.at_level(logging.ERROR):
        response = client.post("/api/v1/admissions/public/apply/", json={
            "tenant_id": tenant_id, "student_first_name": "Aïssatou", "student_last_name": "Diallo",
            "parent_first_name": "Mamadou", "parent_last_name": "Diallo", "parent_email": "m.diallo@example.com",
            "parent_phone": "+224621000000",
        })
    assert response.status_code == 201, response.text
    assert any("mise en file impossible" in record.getMessage() for record in caplog.records)
    with SessionLocal() as db:
        assert db.query(AdmissionApplication).filter(AdmissionApplication.tenant_id == tenant_id).count() == 1


@needs_postgres
@pytest.mark.parametrize("start,target,queued", [
    (AdmissionStatus.UNDER_REVIEW, "ACCEPTED", True),
    (AdmissionStatus.SUBMITTED, "REJECTED", True),
    (AdmissionStatus.SUBMITTED, "UNDER_REVIEW", False),
])
def test_only_a_decision_queues_a_decision_email(start, target, queued):
    tenant_id = _school()
    application_id = _application(tenant_id, status=start)
    response = client.patch(f"/api/v1/admissions/{application_id}/status/", json={"status": target},
                            headers=_as_admin(tenant_id))
    assert response.status_code == 200, response.text
    expected = [("send_admission_email", {"tenant_id": tenant_id, "application_id": application_id, "kind": target})]
    assert QUEUED == (expected if queued else [])


# --- Tâche : contenu et traçabilité --------------------------------------------------------------

def _run(monkeypatch, tenant_id, application_id, kind, ok=True):
    sent = []

    def fake_send(self, to, subject, html, text=None, reply_to=None):
        sent.append({"to": to, "subject": subject, "html": html, "text": text, "reply_to": reply_to,
                     "from_name": self.from_name})
        return ok

    monkeypatch.setattr("app.services.notifications.EmailSender.send", fake_send)
    result = asyncio.run(send_admission_email({}, tenant_id=tenant_id, application_id=application_id, kind=kind))
    return result, sent


def _job_status(job_id):
    with SessionLocal() as db:
        return db.query(Job).filter(Job.id == job_id).first().status


def test_receipt_email_content_is_escaped_and_has_no_internal_note(monkeypatch):
    tenant_id = _school()
    application_id = _application(tenant_id)
    result, [mail] = _run(monkeypatch, tenant_id, application_id, "RECEIVED")
    assert mail["to"] == "parent@example.com"
    assert mail["reply_to"] == "admissions@lycee.gn"
    assert mail["from_name"] == "Lycée <i>Kaloum</i>"
    assert "candidature bien reçue" in mail["subject"]
    assert "<b>Bah</b>" not in mail["html"] and "&lt;b&gt;Bah&lt;/b&gt;" in mail["html"]
    assert "<i>Kaloum</i>" not in mail["html"]
    assert "NOTE INTERNE" not in mail["html"] and "NOTE INTERNE" not in mail["text"]
    assert f"/inscription/adm-{tenant_id[:8]}/statut" in mail["text"]
    assert application_id in mail["text"]
    assert _job_status(result["job_id"]) == "SUCCESS"


def test_reenrollment_and_decision_wording(monkeypatch):
    tenant_id = _school(contact_email=None)
    application_id = _application(tenant_id, documents={"type": "REINSCRIPTION", "student_id": str(uuid.uuid4())})
    _, [accepted] = _run(monkeypatch, tenant_id, application_id, "ACCEPTED")
    assert "demande de réinscription acceptée" in accepted["subject"]
    assert accepted["reply_to"] is None
    _, [rejected] = _run(monkeypatch, tenant_id, application_id, "REJECTED")
    assert "réponse à votre demande de réinscription" in rejected["subject"]
    assert "NOTE INTERNE" not in rejected["text"]


def test_a_failed_delivery_is_a_failed_job(monkeypatch):
    tenant_id = _school()
    application_id = _application(tenant_id)
    result, _ = _run(monkeypatch, tenant_id, application_id, "RECEIVED", ok=False)
    assert result["sent"] is False
    assert _job_status(result["job_id"]) == "FAILED"


def test_missing_application_or_email_is_skipped_without_sending(monkeypatch):
    tenant_id = _school()
    result, sent = _run(monkeypatch, tenant_id, str(uuid.uuid4()), "RECEIVED")
    assert result["skipped"] == "application_not_found" and sent == []
    application_id = _application(tenant_id, parent_email="")
    result, sent = _run(monkeypatch, tenant_id, application_id, "RECEIVED")
    assert result["skipped"] == "no_parent_email" and sent == []


def test_unknown_kind_is_refused():
    with pytest.raises(ValueError):
        build_admission_email("CONVERTED", school="X", student="Y", reference="1", track_url="u", is_reenrollment=False)
