"""Isolation tenant sous un rôle NOSUPERUSER NOBYPASSRLS avec réutilisation de connexions.

Régression de la remédiation « pooler » (2026-10) : le contexte tenant était posé une
fois par session avec ``set_config(..., false)`` (portée SESSION). Derrière un pooler en
mode transaction (PgBouncer, endpoint ``-pooler`` de Neon), chaque transaction peut
tourner sur une autre connexion serveur : le contexte d'un client était hérité par le
suivant (A -> B), une requête tenant pouvait tomber sur un contexte vide (contournement
plateforme des 15 tables de la migration 20260929_0001), et la transaction suivante
d'une même session pouvait perdre le sien. Reproduit sur une branche Neon.

Le contexte vit désormais côté application (``Session.info``) et est reposé en
``set_config(..., true)`` (local à la transaction) au début de CHAQUE transaction
(``app.core.database._reapply_rls_context_on_begin``).

Simulation du pooler sans PgBouncer : un moteur ``StaticPool`` n'a qu'UNE connexion
physique, partagée par toutes les sessions — c'est le pire cas d'un pooler en mode
transaction (les transactions de clients différents s'enchaînent sur la même connexion
serveur). Le test parallèle utilise un vrai pool de quelques connexions.
"""
from __future__ import annotations

import random
import threading
import uuid
from contextlib import contextmanager

import pytest

from conftest import get_test_client

client = get_test_client()

import app.core.database as db_module  # noqa: E402
from app.core.database import (  # noqa: E402
    _set_rls_context,
    engine,
    get_db,
    platform_db_session,
    tenant_context,
    worker_db_session,
)
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import DBAPIError  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

requires_postgres = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Row-Level Security is PostgreSQL-specific.",
)

ROLE = "test_rls_pooling_restricted_role"
ROLE_PASSWORD = "test-only-pooling-role-password"  # noqa: S105 — rôle jetable, base de test uniquement


@contextmanager
def _rls_violation():
    """Attend un refus RLS : SQLSTATE 42501 (insufficient_privilege), indépendant de la langue serveur."""
    with pytest.raises(DBAPIError) as ei:
        yield
    assert getattr(ei.value.orig, "sqlstate", None) == "42501", f"SQLSTATE inattendu : {getattr(ei.value.orig, 'sqlstate', None)}"


def _restricted_url():
    return make_url(engine.url.render_as_string(hide_password=False)).set(
        username=ROLE, password=ROLE_PASSWORD
    ).render_as_string(hide_password=False)


def _make_tenant(conn, label):
    tid = str(uuid.uuid4())
    conn.execute(
        text(
            "INSERT INTO tenants (id, name, slug, type, country, is_active, settings, created_at, updated_at) "
            "VALUES (:id, :name, :slug, 'primary', 'GN', true, '{}', now(), now())"
        ),
        {"id": tid, "name": label, "slug": f"pool-{tid[:8]}"},
    )
    return tid


def _make_user(conn, tenant_id):
    uid = str(uuid.uuid4())
    conn.execute(
        text(
            "INSERT INTO users (id, email, username, tenant_id, created_at, updated_at, mfa_enabled, must_change_password) "
            "VALUES (:id, :email, :username, :tid, now(), now(), false, false)"
        ),
        {"id": uid, "email": f"{uid[:8]}@pool.test", "username": f"p{uid[:8]}", "tid": tenant_id},
    )
    return uid


def _make_job(conn, tenant_id):
    jid = str(uuid.uuid4())
    conn.execute(
        text("INSERT INTO jobs (id, tenant_id, job_type, status) VALUES (:id, :tid, 'pool_test', 'RUNNING')"),
        {"id": jid, "tid": tenant_id},
    )
    return jid


def _visible_users(db, ids):
    rows = db.execute(text("SELECT id::text FROM users WHERE id::text = ANY(:ids)"), {"ids": list(ids)}).scalars().all()
    return set(rows)


@requires_postgres
class TestRlsTenantContextPooling:

    @pytest.fixture(scope="class")
    def restricted_role(self):
        with engine.connect() as conn:
            exists = conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": ROLE}).first()
            if exists:  # reste d'une exécution interrompue
                conn.execute(text(f'DROP OWNED BY "{ROLE}"'))
                conn.execute(text(f'DROP ROLE "{ROLE}"'))
            conn.execute(text(
                f'CREATE ROLE "{ROLE}" LOGIN PASSWORD \'{ROLE_PASSWORD}\' '
                "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"
            ))
            conn.execute(text(f'GRANT USAGE ON SCHEMA public TO "{ROLE}"'))
            conn.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{ROLE}"'))
            conn.commit()
        yield ROLE
        with engine.connect() as conn:
            conn.execute(text(f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{ROLE}"'))
            conn.execute(text(f'REVOKE USAGE ON SCHEMA public FROM "{ROLE}"'))
            conn.execute(text(f'DROP ROLE IF EXISTS "{ROLE}"'))
            conn.commit()

    @pytest.fixture
    def shared_connection_sessions(self, restricted_role, monkeypatch):
        """Toutes les sessions partagent UNE connexion physique (pire cas pooler)."""
        eng = create_engine(_restricted_url(), poolclass=StaticPool)
        with eng.connect() as conn:
            assert conn.execute(text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")).scalar() is False
        maker = sessionmaker(bind=eng, autocommit=False, autoflush=False)
        monkeypatch.setattr(db_module, "SessionLocal", maker)
        yield maker
        eng.dispose()

    @pytest.fixture
    def data(self):
        with engine.begin() as conn:
            a, b = _make_tenant(conn, "Pool A"), _make_tenant(conn, "Pool B")
            ua, ub = _make_user(conn, a), _make_user(conn, b)
            ja, jb = _make_job(conn, a), _make_job(conn, b)
        yield {"A": a, "B": b, "ua": ua, "ub": ub, "ja": ja, "jb": jb}
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM jobs WHERE id IN (:a, :b)"), {"a": ja, "b": jb})
            conn.execute(text("DELETE FROM users WHERE id IN (:a, :b)"), {"a": ua, "b": ub})
            conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": a, "b": b})

    # ── lecture / écriture inter-tenants ────────────────────────────────────

    def test_tenant_a_reads_a_but_not_b(self, shared_connection_sessions, data):
        with shared_connection_sessions() as db:
            _set_rls_context(db, data["A"])
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ua"]}

    def test_tenant_b_cannot_read_a(self, shared_connection_sessions, data):
        with shared_connection_sessions() as db:
            _set_rls_context(db, data["B"])
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ub"]}

    def test_write_a_to_b_is_refused(self, shared_connection_sessions, data):
        with shared_connection_sessions() as db:
            _set_rls_context(db, data["A"])
            with _rls_violation():
                db.execute(text("UPDATE users SET tenant_id = :b WHERE id = :u"), {"b": data["B"], "u": data["ua"]})
            db.rollback()
            # db.rollback() a terminé la transaction : la suivante reprend bien A.
            with _rls_violation():
                _make_user(db, data["B"])
            db.rollback()

    def test_no_tenant_identity_cannot_access_tenant_rows(self, shared_connection_sessions, data):
        with shared_connection_sessions() as db:
            _set_rls_context(db, None)
            assert _visible_users(db, [data["ua"], data["ub"]]) == set()
            with _rls_violation():
                _make_user(db, data["A"])
            db.rollback()
        with shared_connection_sessions() as fresh:  # session sans aucun contexte posé
            assert _visible_users(fresh, [data["ua"], data["ub"]]) == set()

    # ── transaction suivante / connexion réutilisée ─────────────────────────

    def test_next_transaction_keeps_its_own_context(self, shared_connection_sessions, data):
        with shared_connection_sessions() as db:
            _set_rls_context(db, data["A"])
            assert _visible_users(db, [data["ua"]]) == {data["ua"]}
            db.commit()
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ua"]}, "contexte perdu après commit"
            db.rollback()
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ua"]}, "contexte perdu après rollback"

    def test_context_is_transaction_local_not_session_level(self, shared_connection_sessions, data):
        with shared_connection_sessions() as db:
            _set_rls_context(db, data["A"])
            db.execute(text("SELECT 1"))
            db.commit()
        # Même connexion physique, hors de toute session : rien ne doit subsister.
        with shared_connection_sessions() as other:
            leftover = other.execute(text("SELECT coalesce(current_setting('app.current_tenant_id', true), '')")).scalar()
        assert leftover == "", f"contexte resté sur la connexion physique : {leftover!r}"

    def test_reused_connection_does_not_leak_a_into_unscoped_session(self, shared_connection_sessions, data):
        with shared_connection_sessions() as s1:
            _set_rls_context(s1, data["A"])
            s1.execute(text("SELECT 1"))
            s1.commit()
        with shared_connection_sessions() as s2:
            assert _visible_users(s2, [data["ua"], data["ub"]]) == set(), "fuite A -> session sans contexte"

    @pytest.mark.parametrize("order", [("A", "B", "A"), ("B", "A", "B")])
    def test_pooler_interleaving_never_mixes_tenants(self, shared_connection_sessions, data, order):
        """Deux sessions ouvertes, transactions entrelacées sur UNE connexion physique."""
        first, second = order[0], order[1]
        s1, s2 = shared_connection_sessions(), shared_connection_sessions()
        try:
            _set_rls_context(s1, data[first]); s1.commit()
            _set_rls_context(s2, data[second]); s2.commit()
            own = {"A": data["ua"], "B": data["ub"]}
            for _ in range(5):
                assert _visible_users(s1, [data["ua"], data["ub"]]) == {own[first]}; s1.commit()
                assert _visible_users(s2, [data["ua"], data["ub"]]) == {own[second]}; s2.commit()
        finally:
            s1.close(); s2.close()

    def test_tenant_after_platform_never_inherits_platform_bypass(self, shared_connection_sessions, data):
        with platform_db_session() as db:
            db.execute(text("SELECT 1"))
        with worker_db_session(data["A"]) as db:
            seen = set(db.execute(text("SELECT id::text FROM jobs WHERE id::text = ANY(:i)"), {"i": [data["ja"], data["jb"]]}).scalars())
        assert seen == {data["ja"]}, "le contournement plateforme a fui vers une session tenant"

    # ── contournement plateforme (migration 0929) ───────────────────────────

    def test_platform_bypass_only_in_explicit_platform_context(self, shared_connection_sessions, data):
        ids = [data["ja"], data["jb"]]
        with platform_db_session() as db:
            assert set(db.execute(text("SELECT id::text FROM jobs WHERE id::text = ANY(:i)"), {"i": ids}).scalars()) == set(ids)
        with worker_db_session(data["B"]) as db:
            assert set(db.execute(text("SELECT id::text FROM jobs WHERE id::text = ANY(:i)"), {"i": ids}).scalars()) == {data["jb"]}
        # Le contournement ne s'étend pas aux tables strictes (users) :
        with platform_db_session() as db:
            assert _visible_users(db, [data["ua"], data["ub"]]) == set()

    # ── HTTP get_db() ────────────────────────────────────────────────────────

    def test_get_db_context_survives_commit_and_does_not_leak(self, shared_connection_sessions, data):
        token = tenant_context.set(data["A"])
        try:
            gen = get_db()
            db = next(gen)
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ua"]}
            db.commit()
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ua"]}
            gen.close()
        finally:
            tenant_context.reset(token)
        token = tenant_context.set(data["B"])
        try:
            gen = get_db()
            db = next(gen)
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ub"]}
            gen.close()
        finally:
            tenant_context.reset(token)

    # ── requêtes parallèles (vrai pool) ─────────────────────────────────────

    def test_parallel_sessions_never_contaminate(self, restricted_role, data):
        eng = create_engine(_restricted_url(), pool_size=3, max_overflow=0)
        maker = sessionmaker(bind=eng, autocommit=False, autoflush=False)
        own = {data["A"]: {data["ua"]}, data["B"]: {data["ub"]}, None: set()}
        errors, done = [], []
        lock = threading.Lock()

        def worker(seed):
            rnd = random.Random(seed)
            count = 0
            try:
                for _ in range(25):
                    tenant = rnd.choice([data["A"], data["B"], None])
                    db = maker()
                    try:
                        _set_rls_context(db, tenant)
                        for _ in range(2):  # deux transactions par session
                            got = _visible_users(db, [data["ua"], data["ub"]])
                            if got != own[tenant]:
                                with lock:
                                    errors.append(("contamination", tenant, got))
                            db.commit()
                    finally:
                        db.close()
                    count += 1
            except Exception as exc:  # un thread qui plante ne doit pas donner un faux vert
                with lock:
                    errors.append(("exception", repr(exc)))
            with lock:
                done.append(count)

        try:
            threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        finally:
            eng.dispose()
        assert not errors, f"erreurs : {errors[:3]}"
        assert done == [25] * 8 or sorted(done) == [25] * 8, f"itérations incomplètes : {done}"

    # ── valeur de session résiduelle (déploiement mixte / SET manuel) ───────

    def test_leftover_session_value_is_never_inherited(self, shared_connection_sessions, data):
        """Une valeur de PORTÉE SESSION laissée sur la connexion (ancien code,
        SET manuel) ne doit jamais être vue par une session, même sans contexte."""
        with shared_connection_sessions() as raw:
            raw.execute(text("SELECT set_config('app.current_tenant_id', :a, false)"), {"a": data["A"]})
            raw.commit()
        try:
            with shared_connection_sessions() as undeclared:
                assert _visible_users(undeclared, [data["ua"], data["ub"]]) == set(), "valeur de session héritée"
            with shared_connection_sessions() as b_session:
                _set_rls_context(b_session, data["B"])
                assert _visible_users(b_session, [data["ua"], data["ub"]]) == {data["ub"]}
        finally:
            with shared_connection_sessions() as raw:
                raw.execute(text("SELECT set_config('app.current_tenant_id', '', false)"))
                raw.commit()

    def test_context_change_inside_savepoint_is_refused(self, shared_connection_sessions, data):
        with shared_connection_sessions() as db:
            _set_rls_context(db, data["A"])
            with db.begin_nested():
                with pytest.raises(RuntimeError):
                    _set_rls_context(db, data["B"])
            assert _visible_users(db, [data["ua"], data["ub"]]) == {data["ua"]}
