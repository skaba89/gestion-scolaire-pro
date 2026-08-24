"""Incident production 2026-08-22 : l'annuaire public (/annuaire) et les
landing pages de tenant retombaient silencieusement sur des données de
démo factices parce que GET /tenants/public/ (et les routes de pages/nav
publiques associées) partageaient le plafond générique de l'app entière
(100/minute, voir app/main.py::limiter) — épuisé par du trafic de
navigation tout à fait ordinaire. Reproduit en direct en production.

Ces routes portent désormais leur propre plafond, bien plus généreux
(300/minute, voir public_browsing_limiter dans tenants.py et
public_pages.py) puisqu'elles sont conçues pour être visitées par de
nombreux inconnus anonymes évaluant la plateforme, sans aucune donnée
sensible en jeu. Ce test verrouille que le plafond réellement appliqué
dépasse l'ancien défaut global — pas un test d'auth/permissions (déjà
couvert ailleurs), un garde-fou contre une régression silencieuse vers
le plafond générique.
"""
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402


def _make_tenant() -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id, name="École Rate Limit Test", slug=f"ratelimit-{tenant_id[:8]}",
            type="primary", country="GN", is_active=True, settings={},
        ))
        db.commit()
    return tenant_id


class TestPublicDirectoryRateLimit:
    def test_survives_more_than_the_old_100_per_minute_default(self):
        """150 appels d'affilée à /tenants/public/ (dépasse l'ancien
        plafond générique de 100/minute) ne doivent produire aucun 429 —
        c'est exactement le volume qu'une session de navigation normale
        (chargement de page + StrictMode + retries React Query) peut
        atteindre en pratique."""
        statuses = [client.get("/api/v1/tenants/public/").status_code for _ in range(150)]
        assert all(s == 200 for s in statuses), (
            f"Un ou plusieurs appels ont été bloqués (429) sous le nouveau plafond : "
            f"{[s for s in statuses if s != 200]}"
        )

    def test_public_tenant_detail_survives_the_same_volume(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            slug = db.query(Tenant).filter(Tenant.id == tenant_id).first().slug

        statuses = [client.get(f"/api/v1/tenants/public/{slug}/").status_code for _ in range(150)]
        assert all(s == 200 for s in statuses), (
            f"Un ou plusieurs appels ont été bloqués (429) : {[s for s in statuses if s != 200]}"
        )


class TestPublicPagesRateLimit:
    def test_pages_and_nav_survive_the_same_volume(self):
        tenant_id = _make_tenant()
        with SessionLocal() as db:
            slug = db.query(Tenant).filter(Tenant.id == tenant_id).first().slug

        pages_statuses = [client.get(f"/api/v1/tenants/public/{slug}/pages/").status_code for _ in range(150)]
        nav_statuses = [client.get(f"/api/v1/tenants/public/{slug}/nav/").status_code for _ in range(150)]

        assert all(s == 200 for s in pages_statuses)
        assert all(s == 200 for s in nav_statuses)
