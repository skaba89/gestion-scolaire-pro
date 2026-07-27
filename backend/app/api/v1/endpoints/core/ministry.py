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
import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models.tenant import Tenant

router = APIRouter()


def _regional_director_region(db: Session, current_user: dict) -> str | None:
    """REGIONAL_DIRECTOR is not platform-level — their own tenant_id is set,
    and their visibility must be narrowed to that tenant's region (absolute
    rule: "un rôle régional ne doit voir que sa région"). Returns None for
    any other role (no narrowing), or the region string (possibly None if
    their own tenant has no region set — treated as "no visible region" in
    the caller, not as "see everything")."""
    if "REGIONAL_DIRECTOR" not in (current_user.get("roles") or []):
        return None
    if set(current_user.get("roles") or []) & {"SUPER_ADMIN", "MINISTRY_ADMIN"}:
        return None  # a platform-level role always wins — full visibility
    own_tenant_id = current_user.get("tenant_id")
    if not own_tenant_id:
        return ""
    own_tenant = db.query(Tenant).filter(Tenant.id == own_tenant_id).first()
    return (own_tenant.region if own_tenant else None) or ""


def _compute_overview(db: Session, *, region_filter: str | None = None) -> dict:
    query = db.query(Tenant)
    if region_filter is not None:
        query = query.filter(Tenant.region == (region_filter or None))

    total = query.with_entities(func.count(Tenant.id)).scalar() or 0
    active = query.with_entities(func.count(Tenant.id)).filter(Tenant.is_active.is_(True)).scalar() or 0

    by_region_rows = (
        query.with_entities(Tenant.region, func.count(Tenant.id))
        .group_by(Tenant.region)
        .all()
    )
    by_type_rows = (
        query.with_entities(Tenant.type, func.count(Tenant.id))
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


@router.get("/overview/")
def get_national_overview(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("ministry:read")),
):
    """Aggregate counts only — total establishments, active/inactive,
    grouped by region and by type. Never returns an individual tenant's
    name, contact info, or any data belonging to its students/staff.
    Narrowed to the caller's own region for REGIONAL_DIRECTOR.
    """
    region_filter = _regional_director_region(db, current_user)
    return _compute_overview(db, region_filter=region_filter)


@router.get("/overview/export/")
def export_national_overview_csv(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("ministry:read")),
):
    """CSV export of the same aggregate — Phase 7's "Exports: CSV" starting
    point. Same data, same never-per-tenant-detail boundary as /overview/,
    and same region-narrowing for REGIONAL_DIRECTOR.
    """
    region_filter = _regional_director_region(db, current_user)
    data = _compute_overview(db, region_filter=region_filter)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["categorie", "cle", "valeur"])
    writer.writerow(["total", "total_etablissements", data["total_establishments"]])
    writer.writerow(["total", "etablissements_actifs", data["active_establishments"]])
    writer.writerow(["total", "etablissements_inactifs", data["inactive_establishments"]])
    for region, count in data["by_region"].items():
        writer.writerow(["region", region, count])
    for etype, count in data["by_type"].items():
        writer.writerow(["type", etype, count])
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=schoolflow_ministere_overview.csv"},
    )
