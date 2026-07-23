"""Cycle de vie du token JWT — révocation globale (logout) et sessions actives
(login). Tech Lead audit, Phases 1-2.

Avant ce correctif :
- Le logout blacklistait le jti dans Redis, mais SEUL /auth/refresh/
  vérifiait cette blacklist. Un token blacklisté restait valide sur
  toutes les autres routes authentifiées jusqu'à son expiration naturelle.
- /auth/refresh/ enregistrait la session active et appliquait la limite
  de 5 sessions concurrentes, mais /auth/login/ (le tout premier token)
  ne le faisait jamais.
"""
import os

os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars")

import jwt as jwt_lib
import pytest
from conftest import get_test_client

client = get_test_client()

BOOTSTRAP_URL = "/api/v1/auth/bootstrap/"
LOGIN_URL = "/api/v1/auth/login/"
LOGOUT_URL = "/api/v1/auth/logout/"
LOGOUT_ALL_URL = "/api/v1/auth/logout-all/"
REFRESH_URL = "/api/v1/auth/refresh/"
ME_URL = "/api/v1/users/me/"
GOOD_SECRET = os.environ["BOOTSTRAP_SECRET"]
STRONG_PASSWORD = "T0kenLifecycle!2026"


@pytest.fixture(scope="module", autouse=True)
def _setup():
    """Crée le schéma et désactive les rate-limiters (login 5/min, logout
    20/min, logout-all 5/min) — ce module fait volontairement plusieurs
    logins/logouts consécutifs pour tester des scénarios réels."""
    from app.core.database import Base, engine
    from app.api.v1.endpoints.core.auth import limiter as auth_limiter
    import app.models  # noqa: F401 — register all models

    Base.metadata.create_all(bind=engine)
    previous = auth_limiter.enabled
    auth_limiter.enabled = False
    yield
    auth_limiter.enabled = previous


def _fresh_super_admin() -> str:
    """Bootstrap un super-admin et retourne son email.

    Nettoyage volontairement scopé aux seuls users portant le rôle
    SUPER_ADMIN (jamais un blanket DELETE FROM users) : ce module tourne
    en dernier dans la suite complète, après des dizaines d'autres fichiers
    qui laissent des users référencés par clé étrangère (students, grades,
    attendance...) dans la même base SQLite partagée. Un DELETE non scopé
    y échoue avec une IntegrityError.
    """
    from app.core.database import SessionLocal
    from sqlalchemy import text

    # Le bootstrap refuse s'il existe déjà un SUPER_ADMIN — on ne supprime
    # donc que les comptes ayant ce rôle, pas la table entière.
    db = SessionLocal()
    try:
        super_admin_ids = [
            row[0]
            for row in db.execute(
                text("SELECT user_id FROM user_roles WHERE role = 'SUPER_ADMIN'")
            ).fetchall()
        ]
        db.execute(text("DELETE FROM user_roles WHERE role = 'SUPER_ADMIN'"))
        for uid in super_admin_ids:
            db.execute(text("DELETE FROM users WHERE id = :id"), {"id": uid})
        db.commit()
    finally:
        db.close()

    resp = client.post(BOOTSTRAP_URL, json={"bootstrap_key": GOOD_SECRET, "new_password": STRONG_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["credentials"]["email"]


def _login(email: str) -> dict:
    resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _decode_unverified(token: str) -> dict:
    return jwt_lib.decode(token, options={"verify_signature": False})


# ─── Phase 1 — Révocation globale du token au logout ───────────────────────

class TestGlobalTokenRevocation:
    def test_login_returns_token_with_jti(self):
        """1. Le login retourne un token dont le payload contient un jti."""
        email = _fresh_super_admin()
        token_data = _login(email)
        payload = _decode_unverified(token_data["access_token"])
        assert payload.get("jti")
        assert len(payload["jti"]) > 0

    def test_logout_blacklists_jti_and_api_call_returns_401(self):
        """2 + 3. Le logout blackliste le jti ; un appel API ultérieur avec
        ce même token (sur une route SANS rapport avec /auth/refresh/)
        retourne désormais 401 — c'est le coeur de ce correctif."""
        email = _fresh_super_admin()
        token = _login(email)["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Le token fonctionne avant logout.
        before = client.get(ME_URL, headers=headers)
        assert before.status_code == 200, before.text

        logout_resp = client.post(LOGOUT_URL, headers=headers)
        assert logout_resp.status_code == 200, logout_resp.text

        # Même token, route authentifiée quelconque -> 401.
        after = client.get(ME_URL, headers=headers)
        assert after.status_code == 401, after.text

    def test_refresh_with_blacklisted_token_returns_401(self):
        """4. /auth/refresh/ rejette également un token blacklisté (déjà
        correct avant ce correctif, reste couvert en non-régression)."""
        email = _fresh_super_admin()
        token = _login(email)["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        client.post(LOGOUT_URL, headers=headers)

        resp = client.post(REFRESH_URL, headers=headers)
        assert resp.status_code == 401, resp.text

    @pytest.mark.asyncio
    async def test_blacklist_check_fails_open_when_redis_unavailable(self, monkeypatch):
        """5. Comportement documenté si Redis est indisponible : la
        vérification de blacklist échoue "ouverte" (ne bloque pas la
        requête) plutôt que de renvoyer une erreur 500 ou de bloquer
        toute l'API — cohérent avec les autres fonctionnalités
        optionnelles basées sur Redis dans ce module (verrouillage de
        compte, historique de mots de passe, etc.)."""
        from app.api.v1.endpoints.core.auth import is_token_blacklisted
        from app.core.cache import redis_client

        async def _raise(*args, **kwargs):
            raise ConnectionError("Redis unavailable (simulated)")

        monkeypatch.setattr(redis_client, "exists", _raise)

        result = await is_token_blacklisted("some-jti")
        assert result is False  # fail-open : jamais bloqué par une panne Redis


# ─── Phase 2 — Sessions actives dès le login ────────────────────────────────

class TestActiveSessionsAtLogin:
    """Vérifie le comportement observable en boîte noire (HTTP) plutôt que
    d'inspecter Redis directement : le client redis.asyncio singleton se lie
    à la boucle asyncio du premier appel, et TestClient (httpx) gère sa
    propre boucle interne — une nouvelle boucle via asyncio.run() dans le
    test entre en conflit ("attached to a different loop"). Le comportement
    HTTP de bout en bout est de toute façon la preuve la plus fiable."""

    def test_login_registers_active_session(self):
        """1. Le login enregistre immédiatement une session active : preuve
        par comportement — remplir les 5 slots avec des logins successifs
        (sans jamais passer par /auth/refresh/) suffit à déclencher le
        429 du 6e, ce qui n'était pas le cas avant ce correctif (seul
        /auth/refresh/ enregistrait une session)."""
        email = _fresh_super_admin()
        first = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert first.status_code == 200, first.text
        # Si le login n'enregistrait pas la session, on pourrait login
        # indéfiniment. On le confirme via le test dédié ci-dessous
        # (5 logins OK, 6e refusé) plutôt que de dupliquer la boucle ici.

    def test_sixth_concurrent_login_returns_429(self):
        """2. Un 6e login concurrent (sans logout entre-temps) est refusé
        avec 429 — la limite de 5 sessions s'applique désormais dès le
        login, plus seulement au refresh."""
        email = _fresh_super_admin()

        for i in range(5):
            resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
            assert resp.status_code == 200, f"login #{i+1} failed: {resp.text}"

        sixth = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert sixth.status_code == 429, sixth.text

    def test_logout_removes_active_session(self):
        """3. Le logout libère un slot de session : après avoir rempli les
        5 sessions puis déconnecté l'une d'elles, un nouveau login doit
        de nouveau réussir (sinon la session déconnectée compterait
        encore, et ce 6e login échouerait en 429)."""
        email = _fresh_super_admin()
        tokens = []
        for i in range(5):
            resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
            assert resp.status_code == 200, f"login #{i+1} failed: {resp.text}"
            tokens.append(resp.json()["access_token"])

        # Sans logout, le 6e login est refusé (comportement déjà couvert
        # par test_sixth_concurrent_login_returns_429 — revérifié ici pour
        # que ce test soit indépendant et auto-descriptif).
        blocked = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert blocked.status_code == 429, blocked.text

        logout_resp = client.post(LOGOUT_URL, headers={"Authorization": f"Bearer {tokens[0]}"})
        assert logout_resp.status_code == 200, logout_resp.text

        # Un slot est libéré : le prochain login réussit.
        after_logout = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
        assert after_logout.status_code == 200, after_logout.text

    def test_logout_all_clears_all_active_sessions(self):
        """4. logout-all vide toutes les sessions actives : après avoir
        rempli les 5 slots puis appelé logout-all, 5 nouveaux logins
        doivent de nouveau réussir sans toucher la limite."""
        email = _fresh_super_admin()
        last_token = None
        for i in range(5):
            resp = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
            assert resp.status_code == 200, f"login #{i+1} failed: {resp.text}"
            last_token = resp.json()["access_token"]

        resp = client.post(LOGOUT_ALL_URL, headers={"Authorization": f"Bearer {last_token}"})
        assert resp.status_code == 200, resp.text

        for i in range(5):
            fresh = client.post(LOGIN_URL, data={"username": email, "password": STRONG_PASSWORD})
            assert fresh.status_code == 200, f"login #{i+1} after logout-all failed: {fresh.text}"
