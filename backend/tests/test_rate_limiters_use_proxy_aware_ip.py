"""Audit 2026-08-28 — "pourquoi j'ai eu des 429 sur /annuaire pendant le
réveil de Render ?" a mené à un constat bien plus large : 12 modules
définissaient chacun leur propre slowapi Limiter (ou une fonction-clé
personnalisée) en utilisant `get_remote_address` DIRECTEMENT, au lieu du
`_get_client_ip` déjà corrigé dans app/main.py — celui-ci savait déjà
qu'un incident réel (voir tests/test_client_ip_trust.py) avait rendu
`get_remote_address` inutilisable derrière le proxy Render (il renvoie la
connexion TCP directe, qui est TOUJOURS la même adresse interne du proxy
pour tous les visiteurs, pas la vraie IP du visiteur — sauf à lire
X-Forwarded-For quand la connexion vient bien d'une IP de confiance).

Résultat concret AVANT ce correctif : tous les visiteurs anonymes d'un
même endpoint (annuaire public, connexion, formulaire de contact public,
recherche, IA, MFA, etc.) partageaient le MÊME compteur de rate-limit —
un peu de trafic ordinaire (ou les propres tentatives de reconnexion de
l'app au réveil de Render) suffisait à bloquer tout le monde avec un 429,
pas seulement un visiteur abusif. Le cas le plus sensible : le
rate-limiter de connexion (auth.py) — un attaquant spammant des
tentatives de login aurait pu throttler la connexion de TOUS les autres
visiteurs, pas seulement la sienne.

La logique correcte vit maintenant dans app/core/client_ip.py
(get_client_ip), importée par les 12 modules ci-dessous au lieu de
chacun définir/importer sa propre version cassée. Ce fichier verrouille
qu'aucun des 12 ne régresse vers get_remote_address."""
from app.core.client_ip import get_client_ip


class TestDirectLimitersUseGetClientIp:
    """Modules dont le Limiter() prend get_client_ip directement comme
    key_func — vérifiable par identité de fonction."""

    def test_ai(self):
        from app.api.v1.endpoints.core.ai import limiter
        assert limiter._key_func is get_client_ip

    def test_mfa(self):
        from app.api.v1.endpoints.core.mfa import limiter
        assert limiter._key_func is get_client_ip

    def test_notifications(self):
        from app.api.v1.endpoints.core.notifications import limiter
        assert limiter._key_func is get_client_ip

    def test_platform(self):
        from app.api.v1.endpoints.core.platform import limiter
        assert limiter._key_func is get_client_ip

    def test_rgpd(self):
        from app.api.v1.endpoints.core.rgpd import limiter
        assert limiter._key_func is get_client_ip

    def test_search(self):
        from app.api.v1.endpoints.core.search import limiter
        assert limiter._key_func is get_client_ip

    def test_storage(self):
        from app.api.v1.endpoints.core.storage import limiter
        assert limiter._key_func is get_client_ip

    def test_payments(self):
        from app.api.v1.endpoints.finance.payments import limiter
        assert limiter._key_func is get_client_ip

    def test_admissions(self):
        from app.api.v1.endpoints.operational.admissions import limiter
        assert limiter._key_func is get_client_ip

    def test_tenants_public_browsing(self):
        from app.api.v1.endpoints.core.tenants import public_browsing_limiter
        assert public_browsing_limiter._key_func is get_client_ip

    def test_public_pages_public_browsing(self):
        from app.api.v1.endpoints.core.public_pages import public_browsing_limiter
        assert public_browsing_limiter._key_func is get_client_ip

    def test_main_app_wide_limiter(self):
        from app.main import limiter
        assert limiter._key_func is get_client_ip


class TestWrapperKeyFunctionsDelegateToGetClientIp:
    """Modules dont le Limiter() prend une fonction-clé personnalisée
    (composite IP+tenant, ou bypass de charge) — pas testable par
    identité, il faut vérifier le comportement réel derrière un proxy de
    confiance simulé."""

    def test_login_rate_limit_key_resolves_the_real_client_ip_behind_render(self):
        """auth.py::_login_rate_limit_key — le rate-limiter de connexion,
        le plus sensible des 12 (un attaquant qui spamme des logins ne
        doit throttler QUE lui-même, jamais les autres visiteurs)."""
        from types import SimpleNamespace
        from app.api.v1.endpoints.core.auth import _login_rate_limit_key

        request = SimpleNamespace(
            client=SimpleNamespace(host="10.0.4.23"),  # IP interne Render
            headers={"X-Forwarded-For": "203.0.113.7"},
        )
        assert _login_rate_limit_key(request) == "203.0.113.7"

    def test_submit_form_rate_key_resolves_the_real_client_ip_behind_render(self):
        """public_pages.py::_submit_form_rate_key — le formulaire de
        contact public, sujet aux bots ; doit isoler chaque visiteur, pas
        les regrouper tous derrière l'IP du proxy Render."""
        from types import SimpleNamespace
        from app.api.v1.endpoints.core.public_pages import _submit_form_rate_key

        request = SimpleNamespace(
            client=SimpleNamespace(host="10.0.4.23"),
            headers={"X-Forwarded-For": "203.0.113.7"},
            path_params={"tenant_slug": "ecole-test"},
        )
        assert _submit_form_rate_key(request) == "203.0.113.7:ecole-test"

    def test_hash_ip_helper_receives_the_real_client_ip_not_the_proxy_ip(self):
        """public_pages.py::submit_public_form — le hash d'IP loggé pour
        la détection d'abus doit différer par vrai visiteur, sinon tous
        les soumetteurs d'un même tenant hashent identique."""
        from app.core.client_ip import get_client_ip as _gci
        from app.api.v1.endpoints.core.public_pages import _hash_ip
        from types import SimpleNamespace

        request_a = SimpleNamespace(client=SimpleNamespace(host="10.0.4.23"), headers={"X-Forwarded-For": "203.0.113.7"})
        request_b = SimpleNamespace(client=SimpleNamespace(host="10.0.4.23"), headers={"X-Forwarded-For": "198.51.100.9"})

        hash_a = _hash_ip(_gci(request_a), "ecole-test")
        hash_b = _hash_ip(_gci(request_b), "ecole-test")
        assert hash_a != hash_b
