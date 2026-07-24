"""Ministry / national supervision — read-only aggregates only.

National audit Phase 2 (institutional model) + seed of Phase 7 (module
ministère). Deliberately narrow first slice: MINISTRY_ADMIN can see HOW
MANY establishments/students exist, broken down by region and type — never
an individual establishment's actual student, financial, or personal data.
That boundary is enforced by scope (this endpoint only ever queries
aggregate COUNT()s on the tenants table, never per-tenant detail), not by
row-level security — see the security note below for why.

SECURITY NOTE (found while building this): the Postgres role this app
connects with in local Docker dev is a full superuser, which makes every
RLS policy in this codebase a no-op for that connection regardless of
tenant context — Postgres superusers always bypass RLS, FORCE ROW LEVEL
SECURITY notwithstanding. This must be verified against the actual
production database role (Neon or whichever managed Postgres is used) —
if that role is also a superuser/owner with elevated privileges, tenant
isolation is not actually enforced by RLS in production either, only by
each endpoint's own WHERE tenant_id = ... filtering. Out of scope to fix
here (no production DB access from this session) — flagged for the
platform owner to verify directly against the production connection role:
    SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '<prod db user>';
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models.tenant import Tenant

router = APIRouter()


@router.get("/overview/")
def get_national_overview(
    db: Session = Depends(get_db),
    _current_user: dict = Depends(require_permission("ministry:read")),
):
    """Aggregate counts only — total establishments, active/inactive,
    grouped by region and by type. Never returns an individual tenant's
    name, contact info, or any data belonging to its students/staff.
    """
    total = db.query(func.count(Tenant.id)).scalar() or 0
    active = db.query(func.count(Tenant.id)).filter(Tenant.is_active.is_(True)).scalar() or 0

    by_region_rows = (
        db.query(Tenant.region, func.count(Tenant.id))
        .group_by(Tenant.region)
        .all()
    )
    by_type_rows = (
        db.query(Tenant.type, func.count(Tenant.id))
        .group_by(Tenant.type)
        .all()
    )

    return {
        "total_establishments": total,
        "active_establishments": active,
        "inactive_establishments": total - active,
        "by_region": {(region or "non renseignée"): count for region, count in by_region_rows},
        "by_type": {(etype or "inconnu"): count for etype, count in by_type_rows},
    }
