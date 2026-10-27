"""Campus : limite de l'offre, droits et isolation (module sans aucun test jusque-là).

Grille du 2026-10-26 : Standard / Medium / Premium = un établissement,
Entreprise = plusieurs. max_campuses n'était appliqué nulle part : une offre
Premium pouvait créer autant de campus qu'une offre Entreprise.
"""
import uuid
from datetime import datetime, timezone

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_role import UserRole  # noqa: E402

URL = "/api/v1/campuses/"


def _tenant(plan="standard", status="trialing") -> str:
    tenant_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Tenant(id=tenant_id, name="École Campus", slug=f"campus-{tenant_id[:8]}", type="school",
                      country="GN", is_active=True, settings={}, subscription_plan=plan, subscription_status=status))
        db.commit()
    return tenant_id


def _headers(tenant_id: str | None, role: str = "TENANT_ADMIN") -> dict:
    user_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(User(id=user_id, tenant_id=tenant_id, email=f"c.{user_id[:8]}@ecole.gn", username=f"c.{user_id[:8]}",
                    first_name="Ibrahima", last_name="Barry", password_hash="x", is_active=True))
        db.add(UserRole(id=str(uuid.uuid4()), user_id=user_id, role=role))
        db.commit()
    token = create_access_token({
        "sub": user_id, "tenant_id": tenant_id, "roles": [role], "jti": uuid.uuid4().hex[:16],
        "auth_time": int(datetime.now(timezone.utc).timestamp()),
    })
    return {"Authorization": f"Bearer {token}"}


def _create(headers, name="Campus"):
    return client.post(URL, headers=headers, json={"name": name})


class TestPlanLimit:
    def test_single_establishment_plan_allows_one_campus(self):
        headers = _headers(_tenant("premium", "active"))
        assert _create(headers, "Siège").status_code == 201

        resp = _create(headers, "Annexe")
        assert resp.status_code == 402
        body = resp.json()
        assert body["error"] == "PLAN_LIMIT_CAMPUSES"
        assert (body["limit"], body["current"]) == (1, 1)
        assert "Entreprise" in body["message"]

    def test_trial_follows_standard_limit(self):
        headers = _headers(_tenant())
        assert _create(headers).status_code == 201
        assert _create(headers, "Deuxième").status_code == 402

    def test_enterprise_allows_several_campuses(self):
        headers = _headers(_tenant("enterprise", "active"))
        for i in range(3):
            assert _create(headers, f"Site {i}").status_code == 201

    def test_limit_counts_only_own_campuses(self):
        other = _headers(_tenant("enterprise", "active"))
        for i in range(2):
            _create(other, f"Autre {i}")
        assert _create(_headers(_tenant("standard", "active"))).status_code == 201


class TestAccessAndIsolation:
    def test_teacher_cannot_create_a_campus(self):
        assert _create(_headers(_tenant(), role="TEACHER")).status_code == 403

    def test_other_tenant_cannot_read_update_or_delete(self):
        owner = _headers(_tenant("enterprise", "active"))
        campus_id = _create(owner, "Privé").json()["id"]
        intruder = _headers(_tenant("enterprise", "active"))

        assert client.get(f"{URL}{campus_id}/", headers=intruder).status_code == 404
        assert client.put(f"{URL}{campus_id}/", headers=intruder, json={"name": "Volé"}).status_code == 404
        assert client.delete(f"{URL}{campus_id}/", headers=intruder).status_code == 404
        assert all(c["id"] != campus_id for c in client.get(URL, headers=intruder).json())
        assert client.get(f"{URL}{campus_id}/", headers=owner).json()["name"] == "Privé"
