from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from uuid import uuid4, UUID
from datetime import datetime, date
import traceback
import logging
import json
from fastapi.responses import JSONResponse
from app.core.config import settings

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.utils.audit import log_audit
from app.schemas.tenants import (
    TenantCreate,
    TenantResponse,
    TenantLandingSettings,
    TenantLandingAnnouncement,
    TenantPublicCard,
    TenantPublicStats,
    TenantPublicResponse,
)
from app.models import Tenant, AcademicYear, Campus, Level, Subject, User, UserRole

router = APIRouter()

@router.post("/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant_in: TenantCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new tenant and initialize default data (academic year, campus, levels, subjects).
    Updates current user's tenant_id and assigns TENANT_ADMIN role.
    """
    try:
        # Check if slug exists
        existing = db.query(Tenant).filter(Tenant.slug == tenant_in.slug).first()
        if existing:
            raise HTTPException(status_code=400, detail="Slug already in use")

        # Determine if this was created via full wizard (which includes levels in payload)
        is_full_wizard = bool(tenant_in.levels)

        # Create Tenant
        logger.info(f"Creating tenant: {tenant_in.name}")
        new_tenant = Tenant(
            name=tenant_in.name,
            slug=tenant_in.slug,
            type=tenant_in.type,
            country=tenant_in.country or "GN",
            currency=tenant_in.currency or "GNF",
            email=tenant_in.email,
            phone=tenant_in.phone,
            address=tenant_in.address,
            website=tenant_in.website,
            is_active=True,
            settings={
                "onboarding_step": 4 if is_full_wizard else 1,
                "onboarding_completed": True if is_full_wizard else False
            }
        )
        db.add(new_tenant)
        db.flush() # Get id
        logger.info(f"Tenant created with ID: {new_tenant.id}")

        # 1. Create Academic Year
        logger.info("Initializing academic year...")
        ay_start_date = tenant_in.academic_year_start.date() if tenant_in.academic_year_start else None
        ay_end_date = tenant_in.academic_year_end.date() if tenant_in.academic_year_end else None
        
        # Ensure both dates are present or compute defaults
        if not ay_start_date or not ay_end_date:
            current_year = datetime.now().year
            start_month = datetime.now().month
            ay_start = current_year if start_month >= 8 else current_year - 1
            ay_start_date = ay_start_date or datetime(ay_start, 9, 1).date()
            ay_end_date = ay_end_date or datetime(ay_start + 1, 7, 31).date()
        
        academic_year = AcademicYear(
            tenant_id=new_tenant.id,
            name=f"{ay_start_date.year}-{ay_end_date.year}",
            start_date=ay_start_date,
            end_date=ay_end_date,
            is_current=True
        )
        db.add(academic_year)
        db.flush()

        if tenant_in.terms:
            from app.models import Term
            for i, term_data in enumerate(tenant_in.terms):
                st_date = term_data.get("start_date")
                ed_date = term_data.get("end_date")
                
                # Robust date conversion
                if isinstance(st_date, str) and st_date:
                    st_date = datetime.fromisoformat(st_date.split('T')[0]).date()
                if isinstance(ed_date, str) and ed_date:
                    ed_date = datetime.fromisoformat(ed_date.split('T')[0]).date()
                
                if not st_date or not ed_date:
                    continue # Skip terms with missing dates

                term = Term(
                    tenant_id=new_tenant.id,
                    academic_year_id=academic_year.id,
                    name=term_data.get("name", f"Term {i+1}"),
                    start_date=st_date,
                    end_date=ed_date,
                    sequence_number=i + 1
                )
                db.add(term)

        # 2. Create main Campus
        campus = Campus(
            tenant_id=new_tenant.id,
            name="Campus Principal",
            is_main=True,
            address=tenant_in.address,
            phone=tenant_in.phone
        )
        db.add(campus)

        # 3. Create Levels
        levels_to_create = tenant_in.levels if tenant_in.levels else [
            "CP", "CE1", "CE2", "CM1", "CM2", "6ème", "5ème", "4ème", "3ème", "Seconde", "Première", "Terminale"
        ]
        for i, lvl_name in enumerate(levels_to_create):
            level = Level(
                tenant_id=new_tenant.id,
                name=lvl_name,
                order_index=i + 1
            )
            db.add(level)

        # 4. Create default Subjects
        default_subjects = [
            {"name": "Français", "code": "FR", "coefficient": 3},
            {"name": "Mathématiques", "code": "MATH", "coefficient": 3},
            {"name": "Anglais", "code": "ANG", "coefficient": 2}
        ]
        for sub in default_subjects:
            subject = Subject(
                tenant_id=new_tenant.id,
                name=sub["name"],
                code=sub["code"],
                coefficient=sub["coefficient"]
            )
            db.add(subject)

        # 5. Update/Create current user in DB
        user_id_str = current_user.get("id")
        logger.info(f"Processing tenant creator. current_user info: {current_user}")
        
        user_id = None
        if user_id_str:
            try:
                # Keycloak usually provides UUID strings. 
                # If it's not a valid UUID, searching by ID will crash Postgres on UUID columns.
                user_id = UUID(user_id_str)
            except (ValueError, TypeError, AttributeError):
                logger.warning(f"user_id_str '{user_id_str}' is not a valid UUID. Using keycloak_id lookup.")
                user_id = None

        if not user_id_str:
            user_db = None
        elif user_id:
            user_db = db.query(User).filter(User.id == user_id).first()
        else:
            user_db = db.query(User).filter(User.keycloak_id == user_id_str).first()
    
        if not user_db:
            # First login user might not be in DB yet
            user_db = User(
                id=user_id,
                keycloak_id=user_id_str,
                email=current_user.get("email"),
                username=current_user.get("username") or current_user.get("email") or f"user_{user_id_str[:8]}",
                first_name=current_user.get("first_name", ""),
                last_name=current_user.get("last_name", ""),
                tenant_id=new_tenant.id,
                is_active=True
            )
            db.add(user_db)
        else:
            user_db.tenant_id = new_tenant.id
        
        db.flush() # Ensure user_db has an ID before checking or assigning roles
            
        # Always ensure TENANT_ADMIN role for the creator
        # Check if role already exists for this tenant using the database UUID
        role_exists = db.query(UserRole).filter(
            UserRole.user_id == user_db.id, 
            UserRole.tenant_id == new_tenant.id,
            UserRole.role == "TENANT_ADMIN"
        ).first()
        
        if not role_exists:
            role = UserRole(
                user_id=user_db.id,
                tenant_id=new_tenant.id,
                role="TENANT_ADMIN"
            )
            db.add(role)

        db.commit()
        db.refresh(new_tenant)

        log_audit(
            db,
            user_id=user_id_str,
            tenant_id=new_tenant.id,
            action="CREATE_TENANT",
            resource_type="TENANT",
            resource_id=new_tenant.id,
            details={"name": new_tenant.name, "slug": new_tenant.slug}
        )

        return new_tenant
    except Exception as e:
        error_traceback = traceback.format_exc()
        logger.error(f"Error creating tenant: {e}")
        logger.error(error_traceback)
        db.rollback()
        
        # In development, return the traceback to help debugging
        if settings.DEBUG:
            return JSONResponse(
                status_code=500,
                content={
                    "detail": str(e),
                    "traceback": error_traceback
                }
            )
            
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Erreur interne lors de la création du tenant")

@router.get("/", response_model=List[TenantResponse])
async def list_tenants(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:read"))
):
    """List all tenants (Super Admin only usually)."""
    # require_permission check is already checking if user has tenants:read
    # For now, let's just returns all active tenants
    tenants = db.query(Tenant).filter(Tenant.is_active == True).order_by(Tenant.name).all()
    return tenants

@router.get("/slug/{slug}/", response_model=TenantResponse)
async def get_tenant_by_slug(
    slug: str,
    db: Session = Depends(get_db)
):
    """Public endpoint to fetch tenant info by slug (for landing pages)."""
    tenant = db.query(Tenant).filter(Tenant.slug == slug, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant

@router.get("/settings/")
async def get_tenant_settings(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve settings for the current tenant."""
    tenant_id = current_user.get("tenant_id")
    
    # Robust fallback: if tenant_id is not in token (e.g. just after onboarding)
    # look it up in the database for the current user
    if not tenant_id:
        user_id = current_user.get("id")
        user_db = db.query(User).filter(User.id == user_id).first()
        if user_db:
            tenant_id = user_db.tenant_id
            
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID not found in token or user profile")
        
    sql = text("SELECT settings FROM tenants WHERE id = :tenant_id")
    result = db.execute(sql, {"tenant_id": tenant_id}).fetchone()
    
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        
    return result.settings or {}

@router.patch("/settings/")
async def update_tenant_settings(
    settings_update: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write"))
):
    """Update settings for the current tenant."""
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        user_id = current_user.get("id")
        user_db = db.query(User).filter(User.id == user_id).first()
        if user_db:
            tenant_id = user_db.tenant_id

    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID not found in token")
        
    # Get current settings
    sql_get = text("SELECT settings FROM tenants WHERE id = :tenant_id")
    result = db.execute(sql_get, {"tenant_id": tenant_id}).fetchone()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        
    current_settings = result.settings or {}
    updated_settings = {**current_settings, **settings_update}
    
    # Update settings
    sql_update = text("UPDATE tenants SET settings = :settings, updated_at = NOW() WHERE id = :tenant_id")
    db.execute(sql_update, {"settings": json.dumps(updated_settings), "tenant_id": tenant_id})
    db.commit()
    
    # Log audit
    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE_SETTINGS",
        resource_type="TENANT",
        resource_id=tenant_id,
        details=settings_update
    )
    
    return updated_settings


@router.get("/security-settings/")
async def get_security_settings(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read"))
):
    """
    Retrieve security settings for the current tenant.
    Stored as settings.security in the tenant JSON column.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        user_db = db.query(User).filter(User.id == current_user.get("id")).first()
        if user_db:
            tenant_id = user_db.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID not found")

    result = db.execute(
        text("SELECT settings FROM tenants WHERE id = :tid"),
        {"tid": tenant_id}
    ).fetchone()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    settings = result.settings or {}
    # Return security sub-section with sensible defaults
    return settings.get("security", {
        "password_min_length": 8,
        "password_require_uppercase": True,
        "password_require_numbers": True,
        "password_require_symbols": False,
        "session_timeout_minutes": 480,
        "max_login_attempts": 5,
        "two_factor_required": False,
        "ip_whitelist_enabled": False,
        "ip_whitelist": [],
    })


@router.patch("/security-settings/")
async def update_security_settings(
    security_update: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write"))
):
    """
    Update security settings for the current tenant.
    Merges into settings.security sub-key.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        user_db = db.query(User).filter(User.id == current_user.get("id")).first()
        if user_db:
            tenant_id = user_db.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant ID not found")

    result = db.execute(
        text("SELECT settings FROM tenants WHERE id = :tid"),
        {"tid": tenant_id}
    ).fetchone()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    current_settings = result.settings or {}
    current_security = current_settings.get("security", {})
    updated_security = {**current_security, **security_update}
    updated_settings = {**current_settings, "security": updated_security}

    db.execute(
        text("UPDATE tenants SET settings = :s, updated_at = NOW() WHERE id = :tid"),
        {"s": json.dumps(updated_settings), "tid": tenant_id}
    )
    db.commit()

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE_SECURITY_SETTINGS",
        resource_type="TENANT",
        resource_id=tenant_id,
        details=security_update
    )

    return updated_security


@router.get("/public/", response_model=List[TenantPublicCard])
async def list_public_tenants(
    db: Session = Depends(get_db),
):
    """Public directory listing — returns all active tenants as lightweight cards."""
    tenants = (
        db.query(Tenant)
        .filter(Tenant.is_active == True)
        .order_by(Tenant.name)
        .all()
    )
    cards: List[TenantPublicCard] = []
    for t in tenants:
        landing_raw = (t.settings or {}).get("landing", {}) if isinstance(t.settings, dict) else {}
        cards.append(
            TenantPublicCard(
                id=t.id,
                name=t.name,
                slug=t.slug,
                type=t.type,
                address=t.address,
                email=t.email,
                website=t.website,
                logo_url=landing_raw.get("logo_url"),
                description=landing_raw.get("description"),
                primary_color=landing_raw.get("primary_color", "#1e3a5f"),
            )
        )
    return cards


def _build_public_response(tenant: Any, db: Session) -> TenantPublicResponse:
    """Helper shared by the public/{slug} and by-domain/{domain} routes."""
    landing_raw = (tenant.settings or {}).get("landing", {}) if isinstance(tenant.settings, dict) else {}

    # Parse landing settings with defaults
    try:
        landing = TenantLandingSettings(**landing_raw)
    except Exception:
        landing = TenantLandingSettings()

    # Aggregate stats via raw SQL for performance
    student_count = 0
    teacher_count = 0
    try:
        res = db.execute(
            text("SELECT COUNT(*) FROM students WHERE tenant_id = :tid"),
            {"tid": tenant.id},
        ).scalar()
        student_count = res or 0
    except Exception:
        pass
    try:
        res = db.execute(
            text(
                "SELECT COUNT(*) FROM users u "
                "JOIN user_roles ur ON ur.user_id = u.id "
                "WHERE u.tenant_id = :tid AND ur.role = 'TEACHER'"
            ),
            {"tid": tenant.id},
        ).scalar()
        teacher_count = res or 0
    except Exception:
        pass

    # Programs = levels for public display
    programs = []
    try:
        rows = db.execute(
            text("SELECT id, name FROM levels WHERE tenant_id = :tid ORDER BY order_index"),
            {"tid": tenant.id},
        ).fetchall()
        # Ensure we return objects as expected by the new frontend mapping
        programs = [{"id": str(r[0]), "name": r[1]} for r in rows]
    except Exception:
        pass

    # Departments = Faculty/Departments for universities
    departments = []
    try:
        dept_rows = db.execute(
            text("SELECT id, name, description FROM departments WHERE tenant_id = :tid ORDER BY name"),
            {"tid": tenant.id},
        ).fetchall()
        for d in dept_rows:
            dept_id = str(d[0])
            # Fetch subjects for this department (Filiaires)
            subject_rows = db.execute(
                text(
                    "SELECT s.id, s.name FROM subjects s "
                    "JOIN subject_departments sd ON sd.subject_id = s.id "
                    "WHERE sd.department_id = :did ORDER BY s.name"
                ),
                {"did": dept_id},
            ).fetchall()
            subjects = [{"id": str(s[0]), "name": s[1]} for s in subject_rows]
            departments.append({
                "id": dept_id,
                "name": d[1],
                "description": d[2],
                "subjects": subjects
            })
    except Exception:
        pass

    return TenantPublicResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        type=tenant.type,
        email=tenant.email,
        phone=tenant.phone,
        address=tenant.address,
        website=tenant.website,
        is_active=tenant.is_active,
        landing=landing,
        stats=TenantPublicStats(student_count=student_count, teacher_count=teacher_count),
        programs=programs,
        departments=departments,
        announcements=landing.announcements,
    )


@router.get("/public/", response_model=List[TenantPublicCard])
async def list_public_tenants(
    db: Session = Depends(get_db)
):
    """Publicly list all active tenants with basic info for the directory."""
    tenants = db.query(Tenant).filter(Tenant.is_active == True).order_by(Tenant.name).all()
    
    result = []
    for t in tenants:
        landing = t.settings.get("landing", {}) if t.settings else {}
        result.append(TenantPublicCard(
            id=t.id,
            name=t.name,
            slug=t.slug,
            type=t.type,
            city=t.city,
            country=t.country,
            description=landing.get("tagline") or t.address, # Fallback to address or something
            logo_url=t.logo_url,
            created_at=t.created_at
        ))
    return result


@router.get("/public/{slug}/", response_model=TenantPublicResponse)
async def get_public_tenant_by_slug(
    slug: str,
    db: Session = Depends(get_db),
):
    """Full landing-page data for a tenant identified by its slug (no auth required)."""
    tenant = db.query(Tenant).filter(Tenant.slug == slug, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _build_public_response(tenant, db)


@router.get("/by-domain/{domain}/", response_model=TenantPublicResponse)
async def get_tenant_by_domain(
    domain: str,
    db: Session = Depends(get_db),
):
    """Lookup a tenant by its custom domain stored in settings->landing->custom_domain (no auth required)."""
    try:
        # PostgreSQL JSON operator: settings->'landing'->>'custom_domain'
        result = db.execute(
            text(
                "SELECT id FROM tenants "
                "WHERE is_active = true "
                "AND settings->'landing'->>'custom_domain' = :domain "
                "LIMIT 1"
            ),
            {"domain": domain},
        ).fetchone()
    except Exception as exc:
        logger.error(f"Domain lookup error: {exc}")
        raise HTTPException(status_code=500, detail="Domain lookup failed")

    if not result:
        raise HTTPException(status_code=404, detail="Tenant not found for this domain")

    tenant = db.query(Tenant).filter(Tenant.id == result[0]).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return _build_public_response(tenant, db)


@router.get("/{tenant_id}/", response_model=TenantResponse)
async def get_tenant(
    tenant_id: UUID,  # Enforce UUID type to avoid matching static routes like "settings"
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Fetch specific tenant details."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.patch("/{tenant_id}/", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    tenant_updates: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:write"))
):
    """Update general tenant fields (is_active, type, name, etc.)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Update fields
    for key, value in tenant_updates.items():
        if hasattr(tenant, key):
            setattr(tenant, key, value)

    tenant.updated_at = datetime.now()
    db.commit()
    db.refresh(tenant)

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE_TENANT",
        resource_type="TENANT",
        resource_id=tenant_id,
        details=tenant_updates
    )

    return tenant

@router.post("/onboarding/levels/")
async def setup_tenant_levels(
    levels_in: List[str],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:write"))
):
    """Batch create levels during onboarding."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant associated")
    
    # Clean existing levels if any
    db.execute(text("DELETE FROM levels WHERE tenant_id = :tid"), {"tid": tenant_id})
    
    for i, name in enumerate(levels_in):
        level = Level(tenant_id=tenant_id, name=name, order_index=i+1)
        db.add(level)
    
    db.commit()
    return {"message": f"{len(levels_in)} levels created"}

@router.post("/onboarding/subjects/")
async def setup_tenant_subjects(
    subjects_in: List[Dict[str, Any]],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:write"))
):
    """Batch create subjects during onboarding."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No tenant associated")
    
    db.execute(text("DELETE FROM subjects WHERE tenant_id = :tid"), {"tid": tenant_id})
    
    for sub in subjects_in:
        subject = Subject(
            tenant_id=tenant_id,
            name=sub["name"],
            code=sub.get("code", sub["name"][:3].upper()),
            coefficient=sub.get("coefficient", 1)
        )
        db.add(subject)
        
    db.commit()
    return {"message": f"{len(subjects_in)} subjects created"}

@router.patch("/onboarding/complete/")
async def complete_onboarding(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:write"))
):
    """Complete onboarding with signature and director name."""
    tenant_id = current_user.get("tenant_id")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
        
    tenant.director_name = data.get("director_name")
    tenant.director_signature_url = data.get("signature_url")
    
    # Update settings
    current_settings = tenant.settings or {}
    tenant.settings = {**current_settings, "onboarding_completed": True, "onboarding_step": 4}
    
    db.commit()
    return {"message": "Onboarding completed successfully"}
@router.get("/slug/{slug}/levels/", response_model=List[dict])
async def get_public_tenant_levels(
    slug: str,
    db: Session = Depends(get_db)
):
    """Public endpoint to fetch levels for a tenant by slug."""
    tenant = db.query(Tenant).filter(Tenant.slug == slug, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    rows = db.execute(
        text("SELECT id, name, order_index FROM levels WHERE tenant_id = :tid ORDER BY order_index"),
        {"tid": tenant.id}
    ).fetchall()
    return [{"id": str(r[0]), "name": r[1], "order_index": r[2]} for r in rows]


@router.get("/slug/{slug}/academic-years/current/", response_model=dict)
async def get_public_tenant_current_year(
    slug: str,
    db: Session = Depends(get_db)
):
    """Public endpoint to fetch the current academic year for a tenant by slug."""
    tenant = db.query(Tenant).filter(Tenant.slug == slug, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    row = db.query(AcademicYear).filter(
        AcademicYear.tenant_id == tenant.id, 
        AcademicYear.is_current == True
    ).first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Current academic year not found")
    
    return {
        "id": str(row.id),
        "name": row.name,
        "start_date": row.start_date.isoformat(),
        "end_date": row.end_date.isoformat()
    }
