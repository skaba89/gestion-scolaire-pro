from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import require_permission
from app.schemas.audit import AuditLog
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[AuditLog])
def list_audit_logs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:read")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    severity: Optional[str] = None,
):
    """List audit logs for the current tenant with filtering and pagination."""
    tenant_id = current_user.get("tenant_id")
    offset = (page - 1) * page_size

    where_clauses = ["tenant_id = :tenant_id"]
    params = {"tenant_id": tenant_id, "limit": page_size, "offset": offset}

    if user_id:
        where_clauses.append("user_id = :user_id")
        params["user_id"] = user_id
    if action:
        where_clauses.append("action = :action")
        params["action"] = action
    if resource_type:
        where_clauses.append("resource_type = :resource_type")
        params["resource_type"] = resource_type
    if severity:
        where_clauses.append("severity = :severity")
        params["severity"] = severity.upper()

    where_sql = " AND ".join(where_clauses)
    sql = text(f"""
        SELECT id, tenant_id, user_id, action, COALESCE(severity, 'INFO') as severity,
               resource_type, resource_id, details, ip_address, user_agent, created_at
        FROM audit_logs
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """)

    rows = db.execute(sql, params).mappings().all()
    return rows


# ─── Audit log creation (POST /audit/ and POST /audit/log) ────────────────────

class AuditLogCreate(BaseModel):
    action: str
    severity: Optional[str] = "INFO"
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


@router.post("/", status_code=201)
def create_audit_log(
    body: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:write")),
):
    """Create a new audit log entry. POST /audit/"""
    import json
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    row = db.execute(text("""
        INSERT INTO audit_logs (tenant_id, user_id, action, severity, resource_type, resource_id, details, ip_address, user_agent, created_at)
        VALUES (:tenant_id, :user_id, :action, :severity, :resource_type, :resource_id, :details, :ip_address, :user_agent, NOW())
        RETURNING id, tenant_id, user_id, action, COALESCE(severity, 'INFO') as severity, resource_type, resource_id, details, ip_address, user_agent, created_at
    """), {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "action": body.action,
        "severity": body.severity or "INFO",
        "resource_type": body.resource_type,
        "resource_id": body.resource_id,
        "details": json.dumps(body.details) if body.details else None,
        "ip_address": None,
        "user_agent": None,
    }).mappings().first()
    db.commit()
    return dict(row)


# =============================================================================
# DATA QUALITY endpoints  GET/POST /audit/data-quality/
# =============================================================================

class DataQualityResolve(BaseModel):
    is_resolved: bool
    resolved_at: Optional[str] = None


@router.get("/data-quality/")
def list_data_quality_anomalies(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:read")),
    is_resolved: Optional[bool] = Query(None),
    ordering: str = Query("-detected_at"),
    category: Optional[str] = None,
):
    """List data quality anomalies for the current tenant."""
    tenant_id = current_user.get("tenant_id")
    where = ["tenant_id = :tenant_id"]
    params: Dict[str, Any] = {"tenant_id": tenant_id}

    if is_resolved is not None:
        where.append("is_resolved = :is_resolved")
        params["is_resolved"] = is_resolved
    if category:
        where.append("category = :category")
        params["category"] = category

    # Safe ordering (whitelist)
    order_col = "detected_at"
    order_dir = "DESC"
    if ordering and ordering.lstrip("-") in ("detected_at", "severity", "category", "title", "affected_count"):
        order_col = ordering.lstrip("-")
        order_dir = "ASC" if not ordering.startswith("-") else "DESC"

    sql = text(f"""
        SELECT id, tenant_id, category, severity, title, description,
               resource_type, resource_id, affected_count,
               is_resolved, resolved_by, resolved_at, detected_at, updated_at
        FROM data_quality_anomalies
        WHERE {" AND ".join(where)}
        ORDER BY {order_col} {order_dir}
        LIMIT 200
    """)
    rows = db.execute(sql, params).mappings().all()
    return [dict(r) for r in rows]


@router.post("/data-quality/run-checks/", status_code=200)
def run_data_quality_checks(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:read")),
):
    """Run automated data quality checks and persist any new anomalies found."""
    tenant_id = current_user.get("tenant_id")
    now = datetime.now(timezone.utc)
    issues_found = []

    checks = [
        {
            "category": "students",
            "severity": "high",
            "title": "Élèves sans classe assignée",
            "description": "Des élèves sont inscrits mais n'ont pas de classe assignée pour l'année en cours.",
            "sql": """
                SELECT COUNT(*) as cnt FROM students s
                LEFT JOIN enrollments e ON e.student_id = s.id
                WHERE s.tenant_id = :tid AND e.id IS NULL AND s.status = 'active'
            """,
            "resource_type": "students",
        },
        {
            "category": "finance",
            "severity": "medium",
            "title": "Factures sans montant",
            "description": "Des factures ont un montant total de zéro ou nul.",
            "sql": """
                SELECT COUNT(*) as cnt FROM invoices
                WHERE tenant_id = :tid AND (total_amount IS NULL OR total_amount = 0)
                  AND status != 'cancelled'
            """,
            "resource_type": "invoices",
        },
        {
            "category": "academic",
            "severity": "low",
            "title": "Classes sans enseignant assigné",
            "description": "Des classes n'ont aucun enseignant assigné dans l'emploi du temps.",
            "sql": """
                SELECT COUNT(*) as cnt FROM classrooms c
                LEFT JOIN teacher_assignments ta ON ta.classroom_id = c.id
                WHERE c.tenant_id = :tid AND ta.id IS NULL
            """,
            "resource_type": "classrooms",
        },
    ]

    for check in checks:
        try:
            row = db.execute(text(check["sql"]), {"tid": tenant_id}).mappings().first()
            count = int(row["cnt"]) if row else 0
            if count > 0:
                # Check if anomaly already exists (unresolved)
                existing = db.execute(text("""
                    SELECT id FROM data_quality_anomalies
                    WHERE tenant_id = :tid AND title = :title AND is_resolved = FALSE
                """), {"tid": tenant_id, "title": check["title"]}).mappings().first()

                if not existing:
                    db.execute(text("""
                        INSERT INTO data_quality_anomalies
                        (tenant_id, category, severity, title, description, resource_type, affected_count, detected_at)
                        VALUES (:tid, :cat, :sev, :title, :desc, :rt, :cnt, :now)
                    """), {
                        "tid": tenant_id, "cat": check["category"],
                        "sev": check["severity"], "title": check["title"],
                        "desc": check["description"], "rt": check["resource_type"],
                        "cnt": count, "now": now,
                    })
                    issues_found.append(check["title"])
        except Exception as e:
            logger.warning("Data quality check failed for '%s': %s", check["title"], e)

    db.commit()
    return {
        "status": "ok",
        "checks_run": len(checks),
        "issues_found": len(issues_found),
        "new_anomalies": issues_found,
    }


@router.patch("/data-quality/{anomaly_id}/")
def resolve_data_quality_anomaly(
    anomaly_id: str,
    body: DataQualityResolve,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:read")),
):
    """Mark a data quality anomaly as resolved."""
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    now = datetime.now(timezone.utc)

    row = db.execute(text("""
        UPDATE data_quality_anomalies
        SET is_resolved = :resolved,
            resolved_by = :user_id,
            resolved_at = :resolved_at,
            updated_at = :now
        WHERE id = :id AND tenant_id = :tid
        RETURNING id, is_resolved, resolved_at, updated_at
    """), {
        "resolved": body.is_resolved,
        "user_id": user_id,
        "resolved_at": body.resolved_at or now.isoformat(),
        "now": now,
        "id": anomaly_id,
        "tid": tenant_id,
    }).mappings().first()

    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Anomaly not found")

    db.commit()
    return dict(row)


@router.post("/log", status_code=201)
def create_audit_log_alias(
    body: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:write")),
):
    """Create a new audit log entry. POST /audit/log — alias for POST /audit/"""
    import json
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("id")
    row = db.execute(text("""
        INSERT INTO audit_logs (tenant_id, user_id, action, severity, resource_type, resource_id, details, ip_address, user_agent, created_at)
        VALUES (:tenant_id, :user_id, :action, :severity, :resource_type, :resource_id, :details, :ip_address, :user_agent, NOW())
        RETURNING id, tenant_id, user_id, action, COALESCE(severity, 'INFO') as severity, resource_type, resource_id, details, ip_address, user_agent, created_at
    """), {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "action": body.action,
        "severity": body.severity or "INFO",
        "resource_type": body.resource_type,
        "resource_id": body.resource_id,
        "details": json.dumps(body.details) if body.details else None,
        "ip_address": None,
        "user_agent": None,
    }).mappings().first()
    db.commit()
    return dict(row)
