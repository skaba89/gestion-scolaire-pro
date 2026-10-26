"""Le nginx du frontend ne joint l'API et MinIO que par des alias propres au projet.

Incident 2026-10-26 : en production, le conteneur frontend est aussi branché
sur le réseau Docker partagé « edge » du proxy commun. L'API MineFleet y a
rejoint ce réseau sous son nom de service « api » : `http://api:8000`
résolvait vers elle et tout le trafic /api d'academy-guineenne.org lui était
envoyé (connexion cassée, requêtes des utilisateurs chez une autre
application). Docker ajoute toujours le nom de service comme alias sur
chaque réseau : seul un nom propre au projet est sans ambiguïté.
"""
import re
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
NGINX_CONF = REPO_ROOT / "docker" / "nginx.conf"
COMPOSE = REPO_ROOT / "docker-compose.yml"

pytestmark = pytest.mark.skipif(not NGINX_CONF.exists(), reason="dépôt complet requis (docker/nginx.conf)")

UPSTREAMS = {"api": "gsp-api", "minio": "gsp-minio"}


def _upstream_hosts() -> list[str]:
    conf = NGINX_CONF.read_text()
    targets = re.findall(r"^\s*(?:set\s+\$\w+|proxy_pass)\s+https?://([\w.-]+)", conf, flags=re.MULTILINE)
    assert targets, "aucune cible amont trouvée dans docker/nginx.conf"
    return targets


def test_nginx_never_targets_a_bare_service_name():
    hosts = _upstream_hosts()
    assert not set(hosts) & set(UPSTREAMS), f"nom de service nu dans nginx.conf : {hosts}"
    assert set(UPSTREAMS.values()) <= set(hosts)


def test_compose_declares_the_aliases_nginx_uses():
    services = yaml.safe_load(COMPOSE.read_text())["services"]
    for service, alias in UPSTREAMS.items():
        networks = services[service]["networks"]
        assert alias in networks["schoolflow-network"]["aliases"], (service, networks)
