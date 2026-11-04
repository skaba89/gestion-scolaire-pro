"""Messagerie : présence, « en train d'écrire », recherche (2026-11-04, API-01).

La messagerie appelait des routes inexistantes : chaque contact apparaissait
toujours « hors ligne », l'indicateur « en train d'écrire » ne s'affichait
jamais, la recherche répondait toujours « aucun résultat ». Ce fichier vérifie
le fonctionnement ET la confidentialité (utilisateurs mineurs) : présence lisible
seulement des personnes avec qui l'on partage une conversation, recherche
limitée à SES conversations, cloisonnement par établissement.

PostgreSQL uniquement : tables brutes de app/core/operational_tables.py et
user_presence (migration 20260717_0001), comme les autres tests de messagerie.
"""
import uuid

import pytest
from sqlalchemy import text
from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token, get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402

pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Tables de messagerie brutes (operational_tables.py) : PostgreSQL uniquement.",
)


@pytest.fixture(scope="module", autouse=True)
def _tables():
    from app.core.operational_tables import ensure_operational_tables
    ensure_operational_tables(engine)
    # Même définition que la migration 20260717_0001 (absente de create_all).
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_presence (
                user_id UUID PRIMARY KEY, tenant_id UUID, status VARCHAR(50) DEFAULT 'online',
                is_typing BOOLEAN DEFAULT FALSE, current_conversation_id UUID, metadata JSONB,
                updated_at TIMESTAMPTZ DEFAULT NOW())
        """))
    yield


@pytest.fixture(autouse=True)
def _clean():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _tenant() -> str:
    tid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tid, name="École Messagerie", slug=f"msg-{tid[:8]}", type="primary",
                      country="GN", is_active=True, settings={}))
        db.commit()
    return tid


def _user(tid: str, first: str) -> str:
    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=uid, tenant_id=tid, email=f"{uid[:8]}@exemple.gn", username=f"u-{uid[:8]}",
                    password_hash="x", first_name=first, last_name="Test", is_active=True))
        db.commit()
    return uid


def _conversation(tid: str, members: list, content: str, title: str = "Devoirs de maths") -> str:
    cid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.execute(text("INSERT INTO conversations (id, tenant_id, type, title) VALUES (:id, :tid, 'DIRECT', :t)"),
                   {"id": cid, "tid": tid, "t": title})
        for uid in members:
            db.execute(text("INSERT INTO conversation_participants (id, conversation_id, user_id) VALUES (:id, :c, :u)"),
                       {"id": str(uuid.uuid4()), "c": cid, "u": uid})
        db.execute(text("INSERT INTO messages (id, conversation_id, sender_id, content, tenant_id) "
                        "VALUES (:id, :c, :s, :content, :tid)"),
                   {"id": str(uuid.uuid4()), "c": cid, "s": members[0], "content": content, "tid": tid})
        db.commit()
    return cid


def _presence(uid: str, tid: str, *, online=True, typing_in: str | None = None, age_seconds: int = 0):
    with SessionLocal() as db:
        db.execute(text("""
            INSERT INTO user_presence (user_id, tenant_id, status, is_typing, current_conversation_id, updated_at)
            VALUES (:u, :t, :s, :typing, :c, NOW() - make_interval(secs => :age))
            ON CONFLICT (user_id) DO UPDATE SET status = excluded.status, is_typing = excluded.is_typing,
                current_conversation_id = excluded.current_conversation_id, updated_at = excluded.updated_at
        """), {"u": uid, "t": tid, "s": "online" if online else "offline", "typing": typing_in is not None,
               "c": typing_in, "age": age_seconds})
        db.commit()


def _as(uid: str, tid: str) -> dict:
    user = {"id": uid, "roles": ["STUDENT"], "tenant_id": tid}
    app.dependency_overrides[get_current_user] = lambda: user
    return {"Authorization": f"Bearer {create_access_token({'sub': uid, 'tenant_id': tid, 'roles': ['STUDENT']})}"}


@pytest.fixture
def school():
    tid = _tenant()
    me, partner, stranger = _user(tid, "Aïcha"), _user(tid, "Boubacar"), _user(tid, "Cheick")
    conv = _conversation(tid, [me, partner], "Le devoir de géométrie est pour lundi")
    other_conv = _conversation(tid, [partner, stranger], "Message privé entre deux autres élèves")
    return {"tid": tid, "me": me, "partner": partner, "stranger": stranger, "conv": conv, "other_conv": other_conv}


class TestPresence:
    def test_partner_online_is_visible(self, school):
        _presence(school["partner"], school["tid"], online=True)
        resp = client.get(f"/api/v1/communication/presence/{school['partner']}/", headers=_as(school["me"], school["tid"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_online"] is True

    def test_stale_presence_is_offline_with_last_seen(self, school):
        _presence(school["partner"], school["tid"], online=True, age_seconds=600)
        body = client.get(f"/api/v1/communication/presence/{school['partner']}/", headers=_as(school["me"], school["tid"])).json()
        assert body["is_online"] is False and body["last_seen_at"]

    def test_presence_of_someone_without_shared_conversation_is_404(self, school):
        _presence(school["stranger"], school["tid"], online=True)
        resp = client.get(f"/api/v1/communication/presence/{school['stranger']}/", headers=_as(school["me"], school["tid"]))
        assert resp.status_code == 404, resp.text

    def test_presence_of_another_schools_user_is_404(self, school):
        other_tid = _tenant()
        outsider = _user(other_tid, "Djénab")
        _presence(outsider, other_tid, online=True)
        resp = client.get(f"/api/v1/communication/presence/{outsider}/", headers=_as(school["me"], school["tid"]))
        assert resp.status_code == 404, resp.text


class TestTyping:
    def test_partner_typing_in_this_conversation_is_listed_with_first_name(self, school):
        _presence(school["partner"], school["tid"], typing_in=school["conv"])
        resp = client.get(f"/api/v1/communication/conversations/{school['conv']}/typing/", headers=_as(school["me"], school["tid"]))
        assert resp.status_code == 200, resp.text
        assert resp.json() == [{"user_id": school["partner"], "first_name": "Boubacar"}]

    def test_stale_or_other_conversation_typing_is_not_listed(self, school):
        _presence(school["partner"], school["tid"], typing_in=school["conv"], age_seconds=60)
        h = _as(school["me"], school["tid"])
        assert client.get(f"/api/v1/communication/conversations/{school['conv']}/typing/", headers=h).json() == []
        _presence(school["partner"], school["tid"], typing_in=school["other_conv"])
        assert client.get(f"/api/v1/communication/conversations/{school['conv']}/typing/", headers=h).json() == []

    def test_non_participant_cannot_watch_a_conversation(self, school):
        resp = client.get(f"/api/v1/communication/conversations/{school['other_conv']}/typing/", headers=_as(school["me"], school["tid"]))
        assert resp.status_code == 404, resp.text


class TestSearch:
    def test_finds_my_messages_with_sender_and_subject(self, school):
        resp = client.get("/api/v1/communication/messages/search/", params={"q": "Géométrie"},  # casse différente du message
                          headers=_as(school["me"], school["tid"]))
        assert resp.status_code == 200, resp.text
        hits = resp.json()
        assert [h["conversation_id"] for h in hits] == [school["conv"]]
        assert hits[0]["sender"]["first_name"] == "Aïcha"
        assert hits[0]["conversation_subject"] == "Devoirs de maths"

    def test_never_returns_conversations_i_am_not_part_of(self, school):
        resp = client.get("/api/v1/communication/messages/search/", params={"q": "privé"}, headers=_as(school["me"], school["tid"]))
        assert resp.json() == []

    def test_like_wildcards_are_literal(self, school):
        resp = client.get("/api/v1/communication/messages/search/", params={"q": "%%"}, headers=_as(school["me"], school["tid"]))
        assert resp.status_code == 200 and resp.json() == []

    def test_other_school_is_invisible(self, school):
        other_tid = _tenant()
        a, b = _user(other_tid, "E"), _user(other_tid, "F")
        _conversation(other_tid, [a, b], "géométrie dans un autre établissement")
        hits = client.get("/api/v1/communication/messages/search/", params={"q": "géométrie"},
                          headers=_as(school["me"], school["tid"])).json()
        assert {h["conversation_id"] for h in hits} == {school["conv"]}

    def test_too_short_query_is_422(self, school):
        assert client.get("/api/v1/communication/messages/search/", params={"q": "a"},
                          headers=_as(school["me"], school["tid"])).status_code == 422


def test_unread_count_route_used_by_parent_dashboard_exists(school):
    resp = client.get("/api/v1/communication/messaging/unread-count/", headers=_as(school["me"], school["tid"]))
    assert resp.status_code == 200 and "unread" in resp.json()
