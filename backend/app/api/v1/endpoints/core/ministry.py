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
each endpoint's own WHERE tenant_id = ... filtering.

Turned into an automated check (audit stratégique, 2026-08-16) rather
than a one-off manual query someone has to remember to run — see
app/main.py::_check_rls_bypass_role(), surfaced as
components.rls_bypass_role on GET /health/deep/. Its status is
"bypassed" if either rolsuper or rolbypassrls is set on the connecting
role — a platform owner can now confirm this directly in production by
hitting that endpoint instead of needing raw DB access:
    SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
"""
import csv
import io

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, false
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.core.tenant_resolution import resolve_current_tenant_id
from app.models.tenant import Tenant

router = APIRouter()


# Narrower-to-widest order — the first matching institutional role in this
# list determines the caller's scope. A platform-level role (SUPER_ADMIN,
# MINISTRY_ADMIN) always wins over any of these and sees everything.
_SCOPE_ROLES = (
    ("COMMUNE_ADMIN", "commune"),
    ("PREFECTURE_ADMIN", "prefecture"),
    ("REGIONAL_DIRECTOR", "region"),
)


def _institutional_scope(request: Request, db: Session, current_user: dict) -> tuple[str, str] | None:
    """Returns (field, value) to narrow the overview to, or None for no
    narrowing (platform-level role, or the caller holds none of the scoped
    institutional roles). `value` may be "" if the caller's own tenant has
    that field unset — treated as "no visible establishment", never as
    "see everything" (absolute rule: a scoped role must never see beyond
    its own scope just because that scope isn't configured yet).
    """
    roles = set(current_user.get("roles") or [])
    if roles & {"SUPER_ADMIN", "MINISTRY_ADMIN"}:
        return None  # platform-level always wins — full visibility

    for role, field in _SCOPE_ROLES:
        if role in roles:
            own_tenant_id = resolve_current_tenant_id(request, current_user, db)
            if not own_tenant_id:
                return (field, "")
            own_tenant = db.query(Tenant).filter(Tenant.id == own_tenant_id).first()
            value = getattr(own_tenant, field, None) if own_tenant else None
            return (field, value or "")

    return None


def _compute_overview(db: Session, *, scope: tuple[str, str] | None = None) -> dict:
    query = db.query(Tenant)
    if scope is not None:
        field, value = scope
        if not value:
            # The caller's own tenant has this field unset — they must see
            # NO establishment, never every tenant that also has it unset
            # (which `column IS NULL` would otherwise match).
            query = query.filter(false())
        else:
            query = query.filter(getattr(Tenant, field) == value)

    total = query.with_entities(func.count(Tenant.id)).scalar() or 0
    active = query.with_entities(func.count(Tenant.id)).filter(Tenant.is_active.is_(True)).scalar() or 0

    by_region_rows = (
        query.with_entities(Tenant.region, func.count(Tenant.id))
        .group_by(Tenant.region)
        .all()
    )
    by_prefecture_rows = (
        query.with_entities(Tenant.prefecture, func.count(Tenant.id))
        .group_by(Tenant.prefecture)
        .all()
    )
    by_commune_rows = (
        query.with_entities(Tenant.commune, func.count(Tenant.id))
        .group_by(Tenant.commune)
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
        "by_prefecture": {(prefecture or "non renseignée"): count for prefecture, count in by_prefecture_rows},
        "by_commune": {(commune or "non renseignée"): count for commune, count in by_commune_rows},
        "by_type": {(etype or "inconnu"): count for etype, count in by_type_rows},
    }


@router.get("/overview/")
def get_national_overview(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("ministry:read")),
):
    """Aggregate counts only — total establishments, active/inactive,
    grouped by region, prefecture, commune and by type. Never returns an
    individual tenant's name, contact info, or any data belonging to its
    students/staff. Narrowed to the caller's own scope for REGIONAL_DIRECTOR
    (region), PREFECTURE_ADMIN (prefecture) or COMMUNE_ADMIN (commune).
    """
    scope = _institutional_scope(request, db, current_user)
    return _compute_overview(db, scope=scope)


@router.get("/overview/export/")
def export_national_overview_csv(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("ministry:read")),
):
    """CSV export of the same aggregate — Phase 7's "Exports: CSV" starting
    point. Same data, same never-per-tenant-detail boundary as /overview/,
    and same scope-narrowing.
    """
    scope = _institutional_scope(request, db, current_user)
    data = _compute_overview(db, scope=scope)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["categorie", "cle", "valeur"])
    writer.writerow(["total", "total_etablissements", data["total_establishments"]])
    writer.writerow(["total", "etablissements_actifs", data["active_establishments"]])
    writer.writerow(["total", "etablissements_inactifs", data["inactive_establishments"]])
    for region, count in data["by_region"].items():
        writer.writerow(["region", region, count])
    for prefecture, count in data["by_prefecture"].items():
        writer.writerow(["prefecture", prefecture, count])
    for commune, count in data["by_commune"].items():
        writer.writerow(["commune", commune, count])
    for etype, count in data["by_type"].items():
        writer.writerow(["type", etype, count])
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=schoolflow_ministere_overview.csv"},
    )
