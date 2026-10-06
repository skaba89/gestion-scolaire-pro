# Backend — FastAPI / SQLAlchemy / PostgreSQL

Complète le `CLAUDE.md` racine. Détails et gabarits : skills `backend-guide`,
`database-guide`, `rbac-guide`, `testing-guide` dans `.claude/skills/`.

## Carte du code

```
app/main.py                  # app, middlewares, health (/health/live|ready|deep), /metrics/
app/api/v1/router.py         # montage des routers
app/api/v1/endpoints/
  core/                      # auth, mfa, users, tenants, platform, billing, rgpd, storage…
  academic/                  # students, grades, attendance, homework, semesters…
  finance/                   # payments, payment_schedules
  operational/               # school_life, parents, hr, admissions, communication…
  aliases.py                 # alias d'URL attendues par le frontend (dette : ne pas étendre)
app/core/
  security.py                # JWT, get_current_user, ROLE_PERMISSIONS, require_permission, require_plan
  database.py                # engine, get_db (contexte RLS), worker_db_session, platform_db_session
  tenant_resolution.py       # resolve_current_tenant_id
  config.py                  # Settings (get_secret : Docker secret > env > défaut)
  exceptions.py              # SchoolFlowException, NotFoundError, ForbiddenError…
  idempotency.py, jobs.py (enqueue_job), events.py, cache.py, storage.py, ssrf_protection.py
app/middlewares/             # tenant, request_id, metrics, quota
app/models/ schemas/ crud/ services/ utils/audit.py (log_audit) workers/ (ARQ)
alembic/versions/            # chaîne de migrations (une seule head)
tests/                       # pytest (conftest : client, auth_headers, super_admin_headers…)
```

## Endpoint tenant — forme attendue

```python
@router.get("/things/")
def list_things(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),          # toujours borné
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("things:read")),
):
    tenant_id = resolve_current_tenant_id(request, current_user, db)
    ...  # filtrer explicitement par tenant_id (RLS = 2e rempart, pas le seul)
```

Écritures : vérifier que chaque FK reçue appartient au tenant ; contrôle
d'appartenance pour les rôles « personnels » (PARENT → ses enfants, STUDENT →
lui-même, TEACHER → ses classes) ; `log_audit(...)` pour les opérations
sensibles ; idempotence (`core/idempotency.py`) pour les créations financières.

## Règles spécifiques

- Sessions SQLAlchemy **synchrones** : ne pas mélanger avec de l'async DB.
- Jobs ARQ : ouvrir la base **uniquement** via `worker_db_session(tenant_id)` ;
  opérations plateforme via `platform_db_session()`. Enqueue via `enqueue_job`.
- RLS : le contexte `app.current_tenant_id` est posé par `get_db` / helpers de
  `database.py`. Ne jamais appeler `set_config` à la main ailleurs.
- Nouvelle permission → `ROLE_PERMISSIONS` **et** `src/lib/permissions.ts` **et**
  `docs/PERMISSIONS_MATRIX.md`. Opération sensible → envisager `SENSITIVE_PERMISSIONS`.
- Nouveau rôle privilégié → `PRIVILEGED_ROLES` (MFA obligatoire) + doc.
- Nouvelle variable d'env → `config.py` (validation) + `.env.example`,
  `.env.docker.example`, `.env.production.template`.
- Migrations : nouvelle révision seulement, réversible, idempotente (helpers
  `_table_exists` / `_column_exists` / `_index_exists`, voir `docs/MIGRATION_GUIDE.md`),
  politique RLS pour toute nouvelle table tenant. Ne pas exécuter `alembic upgrade`
  sans accord ; jamais contre une base distante.
- Erreurs : lever `SchoolFlowException` / `HTTPException` avec message français ;
  ne jamais renvoyer de trace ni de détail SQL au client.

## Tests

```bash
python -m pytest tests/ -q                     # SQLite — RLS NON exercé
python -m pytest tests/test_<sujet>.py -q -x
```

- La CI exécute aussi la suite sur **PostgreSQL** (RLS réel) : un test
  d'isolation qui ne passe que sur SQLite ne prouve rien.
- Tout endpoint nouveau/modifié : cas nominal, 401, 403 (rôle non autorisé),
  cross-tenant (404/403), FK d'un autre tenant refusée.
- Seuil de couverture et commandes exactes : `.github/workflows/ci.yml`.
