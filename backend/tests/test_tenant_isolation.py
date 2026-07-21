"""Cross-tenant isolation for GET /tenants/{tenant_id}/ (Tech Lead audit, Phase 1)."""
import uuid

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}


def _make_tenant(name: str) -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(
            id=tenant_id,
            name=name,
            slug=f"isolation-{tenant_id[:8]}",
            type="SCHOOL",
            country="GN",
            is_active=True,
            settings={},
        ))
        db.commit()
    return tenant_id


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


def test_tenant_admin_cannot_read_another_tenant():
    tenant_a = _make_tenant("École A")
    tenant_b = _make_tenant("École B")
    admin_a = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a}

    try:
        resp = _as(admin_a).get(f"/api/v1/tenants/{tenant_b}/", headers=HEADERS)
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_tenant_admin_can_read_own_tenant():
    tenant_a = _make_tenant("École A2")
    admin_a = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a}

    try:
        resp = _as(admin_a).get(f"/api/v1/tenants/{tenant_a}/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == tenant_a
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_super_admin_can_read_any_tenant():
    tenant_a = _make_tenant("École A3")
    super_admin = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}

    try:
        resp = _as(super_admin).get(f"/api/v1/tenants/{tenant_a}/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == tenant_a
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_create_tenant_requires_tenants_write_permission():
    """A role without tenants:write (e.g. STUDENT) must not be able to create tenants.

    Regression test for a broken dependency
    (`_perm: None = Depends(lambda: require_permission("tenants:write"))`)
    that silently skipped the permission check entirely.
    """
    student = {"id": str(uuid.uuid4()), "roles": ["STUDENT"], "tenant_id": str(uuid.uuid4())}
    payload = {"name": "École Non Autorisée", "slug": f"unauthorized-{uuid.uuid4().hex[:8]}", "type": "SCHOOL"}

    try:
        resp = _as(student).post("/api/v1/tenants/", json=payload, headers=HEADERS)
        assert resp.status_code == 403, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    with SessionLocal() as db:
        assert db.query(Tenant).filter(Tenant.slug == payload["slug"]).first() is None


def test_director_can_write_levels_and_subjects():
    """Regression test: DIRECTOR's frontend UI shows levels:manage/subjects:manage
    (src/lib/permissions.ts) but the backend previously granted no matching
    levels:write/subjects:write, so DIRECTOR's edit buttons always 403'd.
    See docs/PERMISSIONS_MATRIX.md.
    """
    tenant_id = _make_tenant("École Director")
    director = {"id": str(uuid.uuid4()), "roles": ["DIRECTOR"], "tenant_id": tenant_id}

    try:
        resp = _as(director).post(
            "/api/v1/tenants/onboarding/levels/",
            json=["6ème", "5ème"],
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

        resp = _as(director).post(
            "/api/v1/tenants/onboarding/subjects/",
            json=[{"name": "Mathématiques"}],
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_public_slug_endpoint_never_returns_settings():
    """GET /tenants/slug/{slug}/ is unauthenticated -- must never leak
    tenant.settings (security config, MEN Guinee data, signature URLs, ...).
    """
    tenant_id = _make_tenant("Ecole Publique")
    with SessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        tenant.settings = {
            "security": {"two_factor_required": True},
            "director_name": "Secret Director",
            "signature_url": "https://example.com/secret-signature.png",
        }
        slug = tenant.slug
        db.commit()

    resp = client.get(f"/api/v1/tenants/slug/{slug}/")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "settings" not in body
    assert "director_name" not in body
    assert "signature_url" not in body
    assert body["slug"] == slug


def test_tenant_infos_endpoint_resolves_current_tenant():
    tenant_id = _make_tenant("Ecole Infos")
    admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}

    try:
        resp = _as(admin).get("/api/v1/tenants/INFOS/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["id"] == tenant_id
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_men_guinea_rapport_resolves_current_tenant():
    tenant_id = _make_tenant("Ecole MEN")
    admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}

    try:
        resp = _as(admin).get("/api/v1/tenants/men-guinea/rapport/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_full_onboarding_cycle_still_works_for_tenant_admin():
    """End-to-end regression: levels -> subjects -> complete, all via
    resolve_current_tenant_id, must still succeed for a normal TENANT_ADMIN.
    """
    tenant_id = _make_tenant("Ecole Onboarding")
    admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}

    try:
        resp = _as(admin).post(
            "/api/v1/tenants/onboarding/levels/", json=["Lycee"], headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

        resp = _as(admin).post(
            "/api/v1/tenants/onboarding/subjects/",
            json=[{"name": "Francais"}],
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text

        resp = _as(admin).patch(
            "/api/v1/tenants/onboarding/complete/",
            json={"director_name": "M. Test", "signature_url": "https://example.com/sig.png"},
            headers=HEADERS,
        )
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    with SessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert tenant.settings.get("onboarding_completed") is True


def test_get_settings_tenant_admin_receives_own_settings():
    tenant_id = _make_tenant("Ecole Settings A")
    with SessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        tenant.settings = {"currency": "GNF"}
        db.commit()

    admin = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_id}
    try:
        resp = _as(admin).get("/api/v1/tenants/settings/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json()["currency"] == "GNF"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_get_settings_tenant_admin_cannot_target_another_tenant_via_header():
    tenant_a = _make_tenant("Ecole Settings B")
    tenant_b = _make_tenant("Ecole Settings C")
    with SessionLocal() as db:
        db.query(Tenant).filter(Tenant.id == tenant_a).update({"settings": {"marker": "A"}})
        db.query(Tenant).filter(Tenant.id == tenant_b).update({"settings": {"marker": "B"}})
        db.commit()

    admin_a = {"id": str(uuid.uuid4()), "roles": ["TENANT_ADMIN"], "tenant_id": tenant_a}
    try:
        resp = _as(admin_a).get(
            "/api/v1/tenants/settings/",
            headers={**HEADERS, "X-Tenant-ID": tenant_b},
        )
        assert resp.status_code == 200, resp.text
        # Header is ignored for non-SUPER_ADMIN: still gets their own tenant's settings
        assert resp.json()["marker"] == "A"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_get_settings_super_admin_without_header_gets_empty_dict():
    super_admin = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
    try:
        resp = _as(super_admin).get("/api/v1/tenants/settings/", headers=HEADERS)
        assert resp.status_code == 200, resp.text
        assert resp.json() == {}
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_get_settings_super_admin_with_header_gets_targeted_tenant():
    tenant_id = _make_tenant("Ecole Settings D")
    with SessionLocal() as db:
        db.query(Tenant).filter(Tenant.id == tenant_id).update({"settings": {"marker": "targeted"}})
        db.commit()

    super_admin = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
    try:
        resp = _as(super_admin).get(
            "/api/v1/tenants/settings/",
            headers={**HEADERS, "X-Tenant-ID": tenant_id},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["marker"] == "targeted"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
