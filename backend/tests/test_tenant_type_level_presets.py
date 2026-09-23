"""Guinea level presets by establishment type — never exercised by a test.

Institutional-readiness follow-up (2026-09): the permissions sweep in
docs/PERMISSIONS_MATRIX.md confirmed schedule/elearning/enrollments/finance
access is not gated by tenant.type (any of the 5 VALID_TENANT_TYPES behaves
identically for RBAC purposes). But POST /tenants/ auto-creates a school's
initial Level rows from guinea_levels_for_type() (app/core/guinea_presets.py),
and that function had zero test coverage: `grep -rl guinea_levels_for_type
backend/tests` returned nothing, and only 1 test file across the whole
backend suite creates a tenant with type in {middle, high, training} versus
105 for "primary" and 9 for "university". A typo or reordering in
GUINEA_LEVELS_BY_TYPE would silently ship wrong levels for 3 of the 5
establishment types with no test failing.
"""
import uuid

import pytest

from conftest import get_test_client

client = get_test_client()

from app.core.database import SessionLocal  # noqa: E402
from app.core.guinea_presets import guinea_levels_for_type  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models.level import Level  # noqa: E402

HEADERS = {"Authorization": "Bearer mock-token"}

# Hardcoded independently of app.core.guinea_presets.GUINEA_LEVELS_BY_TYPE:
# asserting against that same dict would be tautological (a corrupted
# preset and its "expected" value would corrupt together and the test
# would keep passing). This is the actual Guinean system's levels per
# establishment type, pinned as of 2026-09.
EXPECTED_LEVELS_BY_TYPE = {
    "primary": ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"],
    "middle": ["7ème", "8ème", "9ème", "10ème"],
    "high": ["11ème", "12ème", "Terminale"],
    "university": ["Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2"],
    "training": ["Année 1", "Année 2", "Année 3"],
}


def _as(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("tenant_type", sorted(EXPECTED_LEVELS_BY_TYPE))
def test_tenant_creation_seeds_the_guinea_levels_for_its_type(tenant_type):
    super_admin = {"id": str(uuid.uuid4()), "roles": ["SUPER_ADMIN"], "tenant_id": None}
    slug = f"presets-{tenant_type}-{uuid.uuid4().hex[:8]}"
    payload = {
        "name": f"Établissement {tenant_type}",
        "slug": slug,
        "type": tenant_type,
    }

    resp = _as(super_admin).post("/api/v1/tenants/", json=payload, headers=HEADERS)
    assert resp.status_code == 201, resp.text
    tenant_id = resp.json()["id"]

    with SessionLocal() as db:
        levels = (
            db.query(Level)
            .filter(Level.tenant_id == tenant_id)
            .order_by(Level.order_index)
            .all()
        )
        level_names = [level.name for level in levels]

    assert level_names == EXPECTED_LEVELS_BY_TYPE[tenant_type]


def test_tenant_creation_falls_back_to_full_levels_for_unknown_or_missing_type():
    """guinea_levels_for_type() falls back to the "full school" preset
    (primary+middle+high) when type is missing or unrecognized, but
    TenantCreate._validate_type already rejects unrecognized types at the
    schema level — so the only reachable case through the real endpoint is
    the function's own default parameter behavior, exercised directly."""
    expected_full = (
        EXPECTED_LEVELS_BY_TYPE["primary"] + EXPECTED_LEVELS_BY_TYPE["middle"] + EXPECTED_LEVELS_BY_TYPE["high"]
    )
    assert guinea_levels_for_type(None) == expected_full
    assert guinea_levels_for_type("not_a_real_type") == expected_full
