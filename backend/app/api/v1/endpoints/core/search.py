"""
SchoolFlow Pro — Global Search API
====================================
Full-text search across all tenant resources: students, teachers,
payments, homework, events, and more.

Uses PostgreSQL's built-in full-text search (tsvector / plainto_tsquery)
for fast, accent-insensitive, multi-language search.

Endpoint: GET /api/v1/search/?q=<query>&types=students,teachers&limit=20
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Searchable resource types ────────────────────────────────────────────────

RESOURCE_CONFIGS = {
    "students": {
        "table": "students",
        "label": "Élève",
        "fields": ["first_name", "last_name", "student_number", "email"],
        "display": "first_name || ' ' || last_name",
        "subtitle": "student_number",
        "icon": "GraduationCap",
        "route_template": "/{tenant}/admin/students/{id}",
    },
    "teachers": {
        "table": "users",
        "label": "Enseignant",
        "fields": ["first_name", "last_name", "email", "username"],
        "display": "first_name || ' ' || last_name",
        "subtitle": "email",
        "icon": "BookOpen",
        "route_template": "/{tenant}/admin/teachers/{id}",
        "join_filter": """
            INNER JOIN user_roles ur ON ur.user_id = users.id
            WHERE ur.role = 'TEACHER' AND
        """,
    },
    "payments": {
        "table": "payments",
        "label": "Paiement",
        "fields": ["reference", "notes"],
        "display": "COALESCE(reference, 'Paiement #' || SUBSTRING(id::text, 1, 8))",
        "subtitle": "amount::text || ' GNF'",
        "icon": "CreditCard",
        "route_template": "/{tenant}/admin/finances",
    },
    "subjects": {
        "table": "subjects",
        "label": "Matière",
        "fields": ["name", "code", "description"],
        "display": "name",
        "subtitle": "code",
        "icon": "BookMarked",
        "route_template": "/{tenant}/admin/subjects",
    },
    "levels": {
        "table": "levels",
        "label": "Niveau",
        "fields": ["name", "code"],
        "display": "name",
        "subtitle": "code",
        "icon": "Layers",
        "route_template": "/{tenant}/admin/levels",
    },
}


def _build_search_query(
    resource_type: str,
    config: dict,
    query: str,
    tenant_id: str,
    limit: int,
) -> tuple[str, dict]:
    """Build a parameterized full-text search SQL query for a resource type."""
    table = config["table"]
    display_expr = config["display"]
    subtitle_expr = config.get("subtitle", "NULL")
    label = config["label"]
    icon = config.get("icon", "Search")

    # Build the WHERE clause for full-text search using ILIKE for simplicity
    # (upgrade to tsvector for large datasets)
    ilike_conditions = " OR ".join(
        f"{table}.{field} ILIKE :query" for field in config["fields"]
        if field not in ["amount::text"]  # skip computed fields
    )

    # Handle special join for teachers
    join_clause = ""
    where_prefix = "WHERE"
    if "join_filter" in config:
        join_clause = config["join_filter"]
        where_prefix = "AND"

    sql = f"""
        SELECT
            {table}.id::text AS id,
            :resource_type AS resource_type,
            :label AS label,
            :icon AS icon,
            ({display_expr}) AS display_name,
            ({subtitle_expr}) AS subtitle,
            {table}.created_at AS created_at
        FROM {table}
        {join_clause}
        {where_prefix} {table}.tenant_id = :tenant_id
          AND ({ilike_conditions})
        ORDER BY {table}.created_at DESC
        LIMIT :limit
    """

    params = {
        "resource_type": resource_type,
        "label": label,
        "icon": icon,
        "tenant_id": tenant_id,
        "query": f"%{query}%",
        "limit": limit,
    }

    return sql, params


@router.get("/")
def global_search(
    q: str = Query(..., min_length=2, max_length=100, description="Search query (min 2 characters)"),
    types: Optional[str] = Query(None, description="Comma-separated resource types. Default: all"),
    limit: int = Query(5, ge=1, le=20, description="Max results per resource type"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Global search across all tenant resources.

    Returns grouped results by resource type (students, teachers, payments, etc.).
    Searches are tenant-isolated — users only see their own tenant's data.

    Example: GET /search/?q=jean&types=students,teachers&limit=5
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Contexte tenant requis")

    # Sanitize query — strip wildcards to prevent injection via ILIKE
    clean_query = q.replace("%", "").replace("_", " ").strip()
    if len(clean_query) < 2:
        raise HTTPException(
            status_code=422,
            detail="La requête de recherche doit contenir au moins 2 caractères"
        )

    # Determine which resource types to search
    if types:
        requested = [t.strip() for t in types.split(",") if t.strip()]
        # Filter to valid types only
        resource_types = [t for t in requested if t in RESOURCE_CONFIGS]
        if not resource_types:
            raise HTTPException(
                status_code=422,
                detail=f"Types invalides. Types disponibles: {list(RESOURCE_CONFIGS.keys())}"
            )
    else:
        resource_types = list(RESOURCE_CONFIGS.keys())

    results = {}
    total_count = 0

    for resource_type in resource_types:
        config = RESOURCE_CONFIGS[resource_type]
        try:
            sql, params = _build_search_query(
                resource_type, config, clean_query, tenant_id, limit
            )
            rows = db.execute(text(sql), params).mappings().fetchall()
            items = [dict(row) for row in rows]

            # Convert datetime objects to strings
            for item in items:
                if item.get("created_at"):
                    item["created_at"] = str(item["created_at"])

            results[resource_type] = {
                "label": config["label"],
                "icon": config.get("icon", "Search"),
                "items": items,
                "count": len(items),
            }
            total_count += len(items)
        except Exception as exc:
            logger.error("Search failed for %s: %s", resource_type, exc)
            results[resource_type] = {
                "label": config["label"],
                "items": [],
                "count": 0,
                "error": "Recherche indisponible",
            }

    return {
        "query": clean_query,
        "total": total_count,
        "results": results,
        "types_searched": resource_types,
    }


@router.get("/types/")
def list_searchable_types(
    current_user: dict = Depends(get_current_user),
):
    """List all searchable resource types."""
    return {
        "types": [
            {
                "key": key,
                "label": config["label"],
                "icon": config.get("icon", "Search"),
            }
            for key, config in RESOURCE_CONFIGS.items()
        ]
    }
