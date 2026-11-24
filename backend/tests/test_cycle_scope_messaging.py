"""Messagerie ouverte aux comptes limités à des cycles (décision Q-B3-2, 2026-11-24).

Le secrétariat et la direction, limités au primaire, joignent tout le personnel, les parents
d'un enfant du primaire et les élèves du primaire — jamais un parent ou un élève seulement du
collège ; ils ne lisent que les fils WhatsApp d'élèves du primaire. Un compte non restreint
n'est pas affecté. PostgreSQL uniquement (comme les autres tests du périmètre par cycle).
"""
from uuid import uuid4

import pytest
from sqlalchemy import text

from conftest import get_test_client

client = get_test_client()

from app.core.cycle_routes import Policy, policy_for  # noqa: E402
from app.core.database import SessionLocal, engine, switch_tenant_context  # noqa: E402
from app.models import MessageThread, ParentStudent, User, UserRole  # noqa: E402
from app.models.student import Student  # noqa: E402
from test_cycle_scope_gate import school, structure  # noqa: E402,F401
from test_cycle_scope_students import call, world  # noqa: E402,F401

needs_postgres = pytest.mark.skipif(engine.dialect.name == "sqlite", reason="périmètre par cycle : PostgreSQL")
C = "/communication"
RESTRICTED = ("secretary", "director")

# Registre lu par test_cycle_scope_students::test_every_filtered_route_has_a_behavioural_test.
MESSAGING_ROUTE_TESTS = {
    ("GET", f"{C}/messaging/recipients/"): "test_recipients_are_staff_and_families_of_the_scope",
    ("GET", f"{C}/messaging/users/"): "test_recipients_are_staff_and_families_of_the_scope",
    ("POST", f"{C}/conversations/"): "test_a_conversation_can_only_be_opened_with_a_recipient_of_the_scope",
    ("GET", f"{C}/whatsapp-threads/"): "test_whatsapp_threads_follow_the_student_of_the_thread",
    ("GET", f"{C}/whatsapp-threads/{{thread_id}}/messages/"): "test_whatsapp_threads_follow_the_student_of_the_thread",
    ("POST", f"{C}/conversations/{{conversation_id}}/reply-whatsapp/"): "test_whatsapp_threads_follow_the_student_of_the_thread",
}


def test_messaging_routes_are_classified():
    for method, path in MESSAGING_ROUTE_TESTS:
        assert policy_for(method, f"/api/v1{path}") is Policy.FILTERED, (method, path)
    for method, path in (("GET", f"{C}/conversations/"), ("POST", f"{C}/conversations/{{conversation_id}}/messages/"),
                         ("GET", f"{C}/announcements/"), ("GET", f"{C}/messaging/unread-count/")):
        assert policy_for(method, f"/api/v1{path}") is Policy.INDEPENDENT, (method, path)
    for method, path in (("POST", f"{C}/announcements/"), ("POST", f"{C}/send-notification-email/"),
                         ("GET", f"{C}/forums/"), ("GET", f"{C}/messaging/teacher-recipients/")):
        assert policy_for(method, f"/api/v1{path}") is Policy.DENY, (method, path)


@pytest.fixture
def families(school, world):
    """Parent d'un seul enfant du collège, comptes élèves pour s_cp (primaire) et s_6e (collège),
    trois fils WhatsApp (élève du primaire, du collège, sans élève)."""
    t = school["tenant"]
    ids = {k: uuid4() for k in ("parent_6e", "pupil_cp", "pupil_6e", "link", "th_cp", "th_6e", "th_none")}
    with SessionLocal() as db:
        for key, role in (("parent_6e", "PARENT"), ("pupil_cp", "STUDENT"), ("pupil_6e", "STUDENT")):
            db.add(User(id=ids[key], tenant_id=t, email=f"{key}-{ids[key]}@example.gn", username=str(ids[key]),
                        password_hash="x", is_active=True, first_name=key, last_name="Test"))
            db.flush()
            db.add(UserRole(tenant_id=t, user_id=ids[key], role=role))
        db.add(ParentStudent(id=ids["link"], tenant_id=t, parent_id=ids["parent_6e"], student_id=world["s_6e"]))
        for key, student in (("pupil_cp", "s_cp"), ("pupil_6e", "s_6e")):
            db.query(Student).filter(Student.id == world[student]).update({"user_id": ids[key]})
        for key, student in (("th_cp", "s_cp"), ("th_6e", "s_6e"), ("th_none", None)):
            db.add(MessageThread(id=ids[key], tenant_id=t, student_id=world[student] if student else None,
                                 parent_id=school["people"]["parent"], status="OPEN"))
        db.commit()
    yield ids
    with SessionLocal() as db:
        switch_tenant_context(db, str(t))
        db.execute(text("DELETE FROM message_items WHERE thread_id IN (SELECT id FROM message_threads "
                        "WHERE tenant_id = CAST(:t AS uuid))"), {"t": str(t)})
        db.query(MessageThread).filter(MessageThread.tenant_id == t).delete()
        db.execute(text("DELETE FROM user_message_status WHERE user_id IN (SELECT user_id FROM "
                        "conversation_participants cp JOIN conversations c ON c.id = cp.conversation_id "
                        "WHERE c.tenant_id = CAST(:t AS uuid))"), {"t": str(t)})
        db.execute(text("DELETE FROM messages WHERE tenant_id = CAST(:t AS uuid)"), {"t": str(t)})
        db.execute(text("DELETE FROM conversation_participants WHERE conversation_id IN "
                        "(SELECT id FROM conversations WHERE tenant_id = CAST(:t AS uuid))"), {"t": str(t)})
        db.execute(text("DELETE FROM conversations WHERE tenant_id = CAST(:t AS uuid)"), {"t": str(t)})
        db.query(Student).filter(Student.tenant_id == t).update({"user_id": None})
        db.query(ParentStudent).filter(ParentStudent.id == ids["link"]).delete()
        for key in ("parent_6e", "pupil_cp", "pupil_6e"):
            db.query(UserRole).filter(UserRole.user_id == ids[key]).delete()
            db.query(User).filter(User.id == ids[key]).delete()
        db.commit()


def ids_of(response):
    assert response.status_code == 200, response.text
    return {item["id"] for item in response.json()}


def conversation_count(school):
    with SessionLocal() as db:
        switch_tenant_context(db, str(school["tenant"]))
        return db.execute(text("SELECT COUNT(*) FROM conversations WHERE tenant_id = CAST(:t AS uuid)"),
                          {"t": str(school["tenant"])}).scalar()


@needs_postgres
def test_recipients_are_staff_and_families_of_the_scope(school, families):
    people = school["people"]
    for who in RESTRICTED:
        for route in (f"{C}/messaging/recipients/", f"{C}/messaging/users/"):
            seen = ids_of(call(school, who, "GET", route))
            assert str(people["teacher"]) in seen and str(people["accountant_free"]) in seen, (who, route)
            assert str(people["parent"]) in seen, (who, route)          # enfant au primaire (s_cp)
            assert str(families["pupil_cp"]) in seen, (who, route)
            assert str(families["parent_6e"]) not in seen, (who, route)  # enfant seulement au collège
            assert str(families["pupil_6e"]) not in seen, (who, route)
    free = ids_of(call(school, "secretary_free", "GET", f"{C}/messaging/users/"))
    assert {str(families["parent_6e"]), str(families["pupil_6e"])} <= free


@needs_postgres
def test_a_conversation_can_only_be_opened_with_a_recipient_of_the_scope(school, families):
    before = conversation_count(school)
    refused = call(school, "secretary", "POST", f"{C}/conversations/",
                   json={"recipient_id": str(families["parent_6e"]), "initial_message": "Bonjour"})
    assert refused.status_code == 404, refused.text
    assert conversation_count(school) == before
    opened = call(school, "secretary", "POST", f"{C}/conversations/",
                  json={"recipient_id": str(school["people"]["parent"]), "initial_message": "Bonjour"})
    assert opened.status_code == 201, opened.text
    # Sa propre conversation reste lisible (route de participant).
    assert opened.json()["conversation_id"] in {c["id"] for c in call(school, "secretary", "GET", f"{C}/conversations/").json()}
    free = call(school, "secretary_free", "POST", f"{C}/conversations/", json={"recipient_id": str(families["parent_6e"])})
    assert free.status_code == 201, free.text


@needs_postgres
def test_whatsapp_threads_follow_the_student_of_the_thread(school, families):
    for who in RESTRICTED:
        assert ids_of(call(school, who, "GET", f"{C}/whatsapp-threads/")) == {str(families["th_cp"])}, who
        assert call(school, who, "GET", f"{C}/whatsapp-threads/{families['th_cp']}/messages/").status_code == 200
        for other in ("th_6e", "th_none"):
            assert call(school, who, "GET", f"{C}/whatsapp-threads/{families[other]}/messages/").status_code == 404
            assert call(school, who, "POST", f"{C}/conversations/{families[other]}/reply-whatsapp/",
                        json={"body": "Bonjour"}).status_code == 404
    assert len(ids_of(call(school, "secretary_free", "GET", f"{C}/whatsapp-threads/"))) == 3
