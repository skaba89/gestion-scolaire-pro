from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from sqlalchemy.orm.attributes import flag_modified
from uuid import uuid4, UUID
from datetime import datetime, date
import traceback
import logging
import json
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
    TenantWithAdminCreate,
    TenantAdminUserCreate,
)
from app.models import Tenant, AcademicYear, Campus, Level, Subject, User, UserRole

router = APIRouter()

@router.post("/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant_in: TenantCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    _perm: None = Depends(lambda: require_permission("tenants:write"))
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
            code=f"AY{ay_start_date.year}-{ay_end_date.year}",
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
                # JWT tokens contain UUID strings.
                # If it's not a valid UUID, searching by ID will crash Postgres on UUID columns.
                user_id = UUID(user_id_str)
            except (ValueError, TypeError, AttributeError):
                logger.warning("user_id_str '%s' is not a valid UUID.", user_id_str)
                user_id = None

        if not user_id_str:
            user_db = None
        elif user_id:
            user_db = db.query(User).filter(User.id == user_id).first()
        else:
            user_db = db.query(User).filter(User.username == user_id_str).first()
    
        if not user_db:
            # First login user might not be in DB yet
            user_db = User(
                id=user_id,
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
        logger.error("Error creating tenant: %s", e)
        logger.error(error_traceback)
        db.rollback()
        
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Erreur interne lors de la création du tenant")

@router.get("/", response_model=List[TenantResponse])
async def list_tenants(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1),
):
    """List all tenants (Super Admin only usually)."""
    # require_permission check is already checking if user has tenants:read
    # For now, let's just returns all active tenants
    query = db.query(Tenant).filter(Tenant.is_active == True).order_by(Tenant.name)

    if page_size >= 100:
        # Default behaviour: return ALL results as a plain list (backward-compatible)
        return query.all()

    # Explicit pagination requested (page_size < 100)
    total = query.count()
    offset = (page - 1) * page_size
    tenants = query.offset(offset).limit(page_size).all()
    return {"items": tenants, "total": total}

@router.get("/INFOS/", response_model=dict)
async def get_tenant_infos(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GET /tenants/INFOS/ — returns current tenant info as a flat dict.

    This endpoint is used by the QuickEnrollmentDialog and other frontend
    components that need tenant metadata (name, settings, etc.).
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        # Fallback: look up user's tenant from DB
        user_id = current_user.get("id")
        if user_id:
            user_db = db.query(User).filter(User.id == user_id).first()
            if user_db:
                tenant_id = user_db.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aucun tenant associé")

    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID tenant invalide")

    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant non trouvé")

    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "type": tenant.type,
        "email": tenant.email,
        "phone": tenant.phone,
        "address": tenant.address,
        "website": tenant.website,
        "country": tenant.country,
        "currency": tenant.currency,
        "is_active": tenant.is_active,
        "settings": tenant.settings or {},
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        "updated_at": tenant.updated_at.isoformat() if tenant.updated_at else None,
    }


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
    
    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant ID")
        
    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        
    return tenant.settings or {}

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
    
    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant ID")

    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        
    current_settings = tenant.settings or {}
    updated_settings = {**current_settings, **settings_update}
    tenant.settings = updated_settings
    tenant.updated_at = datetime.now()
    flag_modified(tenant, 'settings')
    db.commit()
    db.refresh(tenant)
    
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

    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant ID")

    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    tenant_settings = tenant.settings or {}
    # Return security sub-section with sensible defaults
    return tenant_settings.get("security", {
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

    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant ID")

    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    current_settings = tenant.settings or {}
    current_security = current_settings.get("security", {})
    updated_security = {**current_security, **security_update}
    updated_settings = {**current_settings, "security": updated_security}

    tenant.settings = updated_settings
    tenant.updated_at = datetime.now()
    flag_modified(tenant, 'settings')
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
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1),
):
    """Public directory listing — returns all active tenants as lightweight cards."""
    query = (
        db.query(Tenant)
        .filter(Tenant.is_active == True)
        .order_by(Tenant.name)
    )

    if page_size >= 100:
        # Default behaviour: return ALL results as a plain list (backward-compatible)
        tenants = query.all()
    else:
        # Explicit pagination requested (page_size < 100)
        offset = (page - 1) * page_size
        tenants = query.offset(offset).limit(page_size).all()

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

    if page_size >= 100:
        return cards

    # Explicit pagination: wrap in paginated envelope
    total = query.count()
    return {"items": cards, "total": total}


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

        if dept_rows:
            # Batch-fetch all subjects for all departments in ONE query (avoids N+1)
            dept_ids = [str(d[0]) for d in dept_rows]
            placeholders = ", ".join(f":did_{i}" for i in range(len(dept_ids)))
            bind_params = {f"did_{i}": did for i, did in enumerate(dept_ids)}

            all_subject_rows = db.execute(
                text(
                    f"SELECT sd.department_id, s.id, s.name FROM subjects s "
                    f"JOIN subject_departments sd ON sd.subject_id = s.id "
                    f"WHERE sd.department_id IN ({placeholders}) ORDER BY s.name"
                ),
                bind_params,
            ).fetchall()

            # Group subjects by department_id using a dict
            subjects_by_dept: Dict[str, list] = {}
            for sr in all_subject_rows:
                did = str(sr[0])
                if did not in subjects_by_dept:
                    subjects_by_dept[did] = []
                subjects_by_dept[did].append({"id": str(sr[1]), "name": sr[2]})

            for d in dept_rows:
                dept_id = str(d[0])
                departments.append({
                    "id": dept_id,
                    "name": d[1],
                    "description": d[2],
                    "subjects": subjects_by_dept.get(dept_id, [])
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
        logger.error("Domain lookup error: %s", exc)
        raise HTTPException(status_code=500, detail="Domain lookup failed")

    if not result:
        raise HTTPException(status_code=404, detail="Tenant not found for this domain")

    tenant = db.query(Tenant).filter(Tenant.id == result[0]).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return _build_public_response(tenant, db)


def _require_super_admin(current_user: dict):
    """Helper: raise 403 if user is not a SUPER_ADMIN."""
    if "SUPER_ADMIN" not in current_user.get("roles", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé au SUPER_ADMIN")


@router.post("/create-with-admin/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_with_admin(
    tenant_in: TenantWithAdminCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    SUPER_ADMIN only: Create a new tenant AND its first admin user in one transaction.
    The admin user is created with TENANT_ADMIN role for the new tenant.
    """
    _require_super_admin(current_user)

    try:
        # Check if slug exists
        existing = db.query(Tenant).filter(Tenant.slug == tenant_in.slug).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ce slug est déjà utilisé")

        # Check if admin email is already used
        existing_user = db.query(User).filter(User.email == tenant_in.admin_email).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Un utilisateur avec cet email existe déjà")

        # 1. Create Tenant
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
            settings={"onboarding_completed": True, "onboarding_step": 4}
        )
        db.add(new_tenant)
        db.flush()

        # 2. Create Academic Year
        current_year = datetime.now().year
        start_month = datetime.now().month
        ay_start = current_year if start_month >= 8 else current_year - 1
        academic_year = AcademicYear(
            tenant_id=new_tenant.id,
            name=f"{ay_start}-{ay_start + 1}",
            code=f"AY{ay_start}-{ay_start + 1}",
            start_date=datetime(ay_start, 9, 1).date(),
            end_date=datetime(ay_start + 1, 7, 31).date(),
            is_current=True
        )
        db.add(academic_year)

        # 3. Create main Campus
        campus = Campus(
            tenant_id=new_tenant.id,
            name="Campus Principal",
            is_main=True,
            address=tenant_in.address,
            phone=tenant_in.phone
        )
        db.add(campus)

        # 4. Create Levels
        levels_to_create = tenant_in.levels or [
            "CP", "CE1", "CE2", "CM1", "CM2", "6ème", "5ème", "4ème", "3ème",
            "Seconde", "Première", "Terminale"
        ]
        for i, lvl_name in enumerate(levels_to_create):
            level = Level(tenant_id=new_tenant.id, name=lvl_name, order_index=i + 1)
            db.add(level)

        # 5. Create default Subjects
        for sub in [
            {"name": "Français", "code": "FR", "coefficient": 3},
            {"name": "Mathématiques", "code": "MATH", "coefficient": 3},
            {"name": "Anglais", "code": "ANG", "coefficient": 2}
        ]:
            subject = Subject(
                tenant_id=new_tenant.id,
                name=sub["name"], code=sub["code"], coefficient=sub["coefficient"]
            )
            db.add(subject)

        # 6. Create Admin User for this tenant
        from app.core.security import get_password_hash
        admin_user = User(
            email=tenant_in.admin_email,
            username=tenant_in.admin_email,
            first_name=tenant_in.admin_first_name,
            last_name=tenant_in.admin_last_name,
            password_hash=get_password_hash(tenant_in.admin_password),
            tenant_id=new_tenant.id,
            is_active=True,
            is_verified=True
        )
        db.add(admin_user)
        db.flush()

        # 7. Assign TENANT_ADMIN role
        admin_role = UserRole(
            user_id=admin_user.id,
            tenant_id=new_tenant.id,
            role="TENANT_ADMIN"
        )
        db.add(admin_role)

        db.commit()
        db.refresh(new_tenant)

        log_audit(
            db,
            user_id=current_user.get("id"),
            tenant_id=new_tenant.id,
            action="CREATE_TENANT_WITH_ADMIN",
            resource_type="TENANT",
            resource_id=new_tenant.id,
            details={
                "tenant_name": new_tenant.name,
                "admin_email": tenant_in.admin_email,
            }
        )

        logger.info(f"Tenant '{new_tenant.name}' created with admin {tenant_in.admin_email}")
        return new_tenant

    except HTTPException:
        raise
    except Exception as e:
        error_traceback = traceback.format_exc()
        logger.error("Error creating tenant with admin: %s", e)
        logger.error(error_traceback)
        db.rollback()
        raise HTTPException(status_code=500, detail="Erreur lors de la création du tenant")


@router.post("/{tenant_id}/create-admin/", status_code=status.HTTP_201_CREATED)
async def create_tenant_admin_user(
    tenant_id: UUID,
    body: TenantAdminUserCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    SUPER_ADMIN only: Create an admin user for a specific existing tenant.
    """
    _require_super_admin(current_user)

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")

    # SECURITY: Validate role against ROLE_PERMISSIONS and forbid SUPER_ADMIN
    from app.core.security import ROLE_PERMISSIONS
    if body.role == "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Le rôle SUPER_ADMIN ne peut pas être assigné via cet endpoint. Utilisez le bootstrap ou la console d'administration.",
        )
    if body.role not in ROLE_PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rôle invalide: '{body.role}'. Rôles autorisés: {', '.join(sorted(ROLE_PERMISSIONS.keys()))}",
        )

    # Check email uniqueness
    existing_user = db.query(User).filter(User.email == body.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Un utilisateur avec cet email existe déjà")

    from app.core.security import get_password_hash
    new_user = User(
        email=body.email,
        username=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=get_password_hash(body.password),
        tenant_id=tenant.id,
        is_active=True,
        is_verified=True
    )
    db.add(new_user)
    db.flush()

    user_role = UserRole(
        user_id=new_user.id,
        tenant_id=tenant.id,
        role=body.role
    )
    db.add(user_role)
    db.commit()

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant.id,
        action="CREATE_TENANT_ADMIN",
        resource_type="USER",
        resource_id=new_user.id,
        details={"email": body.email, "role": body.role, "tenant": tenant.name}
    )

    return {
        "message": f"Utilisateur {body.email} créé avec le rôle {body.role} pour {tenant.name}",
        "user_id": str(new_user.id),
        "email": body.email,
        "role": body.role,
    }


@router.get("/super-admin/stats/")
async def get_super_admin_tenant_stats(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    SUPER_ADMIN only: Get aggregate stats across all tenants.
    """
    _require_super_admin(current_user)

    tenants = db.query(Tenant).order_by(Tenant.name).all()

    # Batch queries — 3 queries instead of 3N (one per tenant)
    student_rows = db.execute(
        text("SELECT tenant_id, COUNT(*) FROM students GROUP BY tenant_id")
    ).fetchall()
    student_counts = {row[0]: row[1] for row in student_rows}

    user_rows = db.execute(
        text("SELECT tenant_id, COUNT(*) FROM users GROUP BY tenant_id")
    ).fetchall()
    user_counts = {row[0]: row[1] for row in user_rows}

    admin_rows = db.execute(
        text("SELECT tenant_id, COUNT(*) FROM user_roles WHERE role = 'TENANT_ADMIN' GROUP BY tenant_id")
    ).fetchall()
    admin_counts = {row[0]: row[1] for row in admin_rows}

    result = []
    for t in tenants:
        result.append({
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "type": t.type,
            "is_active": t.is_active,
            "email": t.email,
            "phone": t.phone,
            "address": t.address,
            "website": t.website,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "student_count": student_counts.get(t.id, 0),
            "user_count": user_counts.get(t.id, 0),
            "admin_count": admin_counts.get(t.id, 0),
        })
    return result


@router.patch("/{tenant_id}/toggle-status/", response_model=TenantResponse)
async def toggle_tenant_status(
    tenant_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:write"))
):
    """
    Toggle tenant is_active flag. When deactivating, all user sessions for this
    tenant are revoked by incrementing the Redis token_version for every user.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Établissement non trouvé")

    tenant.is_active = not tenant.is_active
    tenant.updated_at = datetime.now()
    db.commit()
    db.refresh(tenant)

    acting_user_id = current_user.get("id")

    if not tenant.is_active:
        # --- DEACTIVATION ---
        log_audit(
            db,
            user_id=acting_user_id,
            tenant_id=str(tenant.id),
            action="DEACTIVATE_TENANT",
            resource_type="TENANT",
            resource_id=str(tenant.id),
            details={"name": tenant.name, "slug": tenant.slug, "is_active": False},
            severity="WARNING",
        )

        # Revoke all sessions for every user belonging to this tenant
        tenant_users = db.query(User.id).filter(User.tenant_id == tenant.id).all()
        if tenant_users:
            try:
                from app.core.cache import redis_client
                redis_async = await redis_client.client
                for (uid,) in tenant_users:
                    key = f"sfp:user_token_version:{uid}"
                    await redis_async.incr(key)
                logger.info(
                    "Revoked sessions for %d users of tenant %s",
                    len(tenant_users), tenant.id,
                )
            except Exception as exc:
                logger.warning("Failed to revoke Redis sessions for tenant %s: %s", tenant.id, exc)
    else:
        # --- ACTIVATION ---
        log_audit(
            db,
            user_id=acting_user_id,
            tenant_id=str(tenant.id),
            action="ACTIVATE_TENANT",
            resource_type="TENANT",
            resource_id=str(tenant.id),
            details={"name": tenant.name, "slug": tenant.slug, "is_active": True},
            severity="INFO",
        )

    return tenant


@router.delete("/{tenant_id}/", status_code=status.HTTP_200_OK)
async def delete_tenant(
    tenant_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("tenants:delete"))
):
    """
    Hard-delete a tenant and all related data (ON DELETE CASCADE handles FKs).
    SUPER_ADMIN only — the ``tenants:delete`` permission is exclusive to SUPER_ADMIN
    (TENANT_ADMIN explicitly excludes it).
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Établissement non trouvé")

    tenant_name = tenant.name

    # Optional safety check: warn if active users remain
    user_count = db.query(User.id).filter(User.tenant_id == tenant.id).count()
    if user_count > 0:
        logger.warning(
            "Deleting tenant '%s' (%s) which still has %d active user(s)",
            tenant_name, tenant.id, user_count,
        )

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=str(tenant.id),
        action="DELETE_TENANT",
        resource_type="TENANT",
        resource_id=str(tenant.id),
        details={"name": tenant_name, "user_count": user_count},
        severity="WARNING",
    )

    db.delete(tenant)
    db.commit()

    return {"detail": "Établissement supprimé définitivement"}


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

    # Only allow safe, explicit fields — protect id, slug, settings, created_at, etc.
    ALLOWED_FIELDS = {
        "name", "type", "email", "phone", "address", "website",
        "country", "currency", "timezone", "is_active",
    }
    unknown_fields = set(tenant_updates.keys()) - ALLOWED_FIELDS
    if unknown_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Fields not allowed: {', '.join(sorted(unknown_fields))}"
        )

    for key, value in tenant_updates.items():
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
        
    current_settings = tenant.settings or {}
    current_settings["director_name"] = data.get("director_name")
    current_settings["signature_url"] = data.get("signature_url")
    
    # Update settings
    current_settings["onboarding_completed"] = True
    current_settings["onboarding_step"] = 4
    
    tenant.settings = current_settings
    flag_modified(tenant, 'settings')
    
    db.commit()
    return {"message": "Onboarding completed successfully"}
# ─────────────────────────────────────────────────────────────────────────────
# MEN Guinée — Conformité administrative
# Fields stored in tenant.settings["men_guinea"] (no migration needed)
# ─────────────────────────────────────────────────────────────────────────────

MEN_GUINEA_FIELDS = [
    "numero_agrement", "region_academique", "prefecture", "commune",
    "statut_juridique", "cycle", "date_ouverture", "capacite_accueil",
    "nombre_salles", "inspection_district",
]


@router.get("/men-guinea/")
async def get_men_guinea_settings(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """
    GET /tenants/men-guinea/
    Returns the MEN Guinée compliance fields stored in settings.men_guinea.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        user_db = db.query(User).filter(User.id == current_user.get("id")).first()
        if user_db:
            tenant_id = user_db.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID introuvable")

    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="ID tenant invalide")

    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")

    men_data = (tenant.settings or {}).get("men_guinea", {})
    # Compute compliance score
    filled = sum(1 for f in MEN_GUINEA_FIELDS if men_data.get(f))
    score = round(filled / len(MEN_GUINEA_FIELDS) * 100)

    return {
        **men_data,
        "_compliance_score": score,
        "_filled_fields": filled,
        "_total_fields": len(MEN_GUINEA_FIELDS),
    }


@router.patch("/men-guinea/")
async def update_men_guinea_settings(
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:write")),
):
    """
    PATCH /tenants/men-guinea/
    Updates MEN Guinée compliance fields in settings.men_guinea.
    Only fields in MEN_GUINEA_FIELDS are accepted.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        user_db = db.query(User).filter(User.id == current_user.get("id")).first()
        if user_db:
            tenant_id = user_db.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID introuvable")

    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="ID tenant invalide")

    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")

    # Only allow whitelisted fields
    unknown = set(data.keys()) - set(MEN_GUINEA_FIELDS)
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Champs non autorisés : {', '.join(sorted(unknown))}"
        )

    current_settings = tenant.settings or {}
    current_men = current_settings.get("men_guinea", {})
    updated_men = {**current_men, **{k: v for k, v in data.items() if v is not None}}

    tenant.settings = {**current_settings, "men_guinea": updated_men}
    tenant.updated_at = datetime.now()
    flag_modified(tenant, "settings")
    db.commit()

    log_audit(
        db,
        user_id=current_user.get("id"),
        tenant_id=tenant_id,
        action="UPDATE_MEN_GUINEA_SETTINGS",
        resource_type="TENANT",
        resource_id=tenant_id,
        details=data,
    )

    filled = sum(1 for f in MEN_GUINEA_FIELDS if updated_men.get(f))
    return {
        **updated_men,
        "_compliance_score": round(filled / len(MEN_GUINEA_FIELDS) * 100),
        "_filled_fields": filled,
        "_total_fields": len(MEN_GUINEA_FIELDS),
    }


@router.get("/men-guinea/rapport/")
async def get_men_guinea_rapport(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("settings:read")),
):
    """
    GET /tenants/men-guinea/rapport/
    Generates a full MEN Guinée compliance report as a JSON object
    (school identity + live stats). Frontend renders it as a printable page.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        user_db = db.query(User).filter(User.id == current_user.get("id")).first()
        if user_db:
            tenant_id = user_db.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID introuvable")

    try:
        tid_uuid = UUID(tenant_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="ID tenant invalide")

    tenant = db.query(Tenant).filter(Tenant.id == tid_uuid).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")

    men = (tenant.settings or {}).get("men_guinea", {})

    # ── Live stats ────────────────────────────────────────────────────────────
    try:
        total_students = db.execute(
            text("SELECT COUNT(*) FROM students WHERE tenant_id = :tid AND status = 'ACTIVE'"),
            {"tid": tid_uuid}
        ).scalar() or 0
    except Exception:
        total_students = 0

    try:
        male_students = db.execute(
            text("SELECT COUNT(*) FROM students WHERE tenant_id = :tid AND status = 'ACTIVE' AND gender = 'male'"),
            {"tid": tid_uuid}
        ).scalar() or 0
    except Exception:
        male_students = 0

    female_students = total_students - male_students

    try:
        total_teachers = db.execute(
            text(
                "SELECT COUNT(DISTINCT u.id) FROM users u "
                "JOIN user_roles ur ON ur.user_id = u.id "
                "WHERE u.tenant_id = :tid AND ur.role = 'TEACHER'"
            ),
            {"tid": tid_uuid}
        ).scalar() or 0
    except Exception:
        total_teachers = 0

    try:
        level_rows = db.execute(
            text("""
                SELECT l.name, COUNT(s.id) AS total,
                       SUM(CASE WHEN s.gender = 'male' THEN 1 ELSE 0 END) AS male,
                       SUM(CASE WHEN s.gender = 'female' THEN 1 ELSE 0 END) AS female
                FROM levels l
                LEFT JOIN classrooms c ON c.level_id = l.id AND c.tenant_id = :tid
                LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'ACTIVE'
                LEFT JOIN students s ON s.id = e.student_id
                WHERE l.tenant_id = :tid
                GROUP BY l.name, l.order_index
                ORDER BY l.order_index
            """),
            {"tid": tid_uuid}
        ).fetchall()
        levels = [
            {"level": r[0], "total": r[1] or 0, "male": r[2] or 0, "female": r[3] or 0}
            for r in level_rows
        ]
    except Exception:
        levels = []

    current_year_row = db.execute(
        text("SELECT name FROM academic_years WHERE tenant_id = :tid AND is_current = true LIMIT 1"),
        {"tid": tid_uuid}
    ).fetchone()
    current_year = current_year_row[0] if current_year_row else "—"

    return {
        # Établissement
        "nom_etablissement": tenant.name,
        "adresse": tenant.address,
        "telephone": tenant.phone,
        "email": tenant.email,
        "type": tenant.type,
        "pays": "République de Guinée",
        "annee_scolaire": current_year,
        # Champs MEN
        "numero_agrement": men.get("numero_agrement", ""),
        "region_academique": men.get("region_academique", ""),
        "prefecture": men.get("prefecture", ""),
        "commune": men.get("commune", ""),
        "statut_juridique": men.get("statut_juridique", ""),
        "cycle": men.get("cycle", ""),
        "date_ouverture": men.get("date_ouverture", ""),
        "capacite_accueil": men.get("capacite_accueil", ""),
        "nombre_salles": men.get("nombre_salles", ""),
        "inspection_district": men.get("inspection_district", ""),
        # Stats live
        "total_eleves": total_students,
        "eleves_garcons": male_students,
        "eleves_filles": female_students,
        "total_enseignants": total_teachers,
        "effectifs_par_niveau": levels,
        # Meta
        "date_rapport": datetime.now().strftime("%d/%m/%Y"),
        "heure_rapport": datetime.now().strftime("%H:%M"),
    }


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
