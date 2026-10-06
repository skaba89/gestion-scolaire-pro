---
name: backend-guide
description: Conventions d'implémentation backend FastAPI/SQLAlchemy d'Academy Guinéenne — endpoints tenant, pagination, validation, erreurs, audit, idempotence, jobs ARQ, configuration. À utiliser pour écrire ou modifier du code dans backend/app.
---

# Backend — conventions d'implémentation

Base : `backend/CLAUDE.md` (carte du code + forme d'endpoint). Ce skill détaille.

## Avant d'écrire

1. Chercher un endpoint voisin du même domaine et **copier son idiome** (imports,
   style de requête ORM vs `text()`, format de réponse).
2. Vérifier si la route existe déjà sous un autre préfixe ou dans `aliases.py`.
3. Lire les tests existants du domaine (`backend/tests/test_<domaine>*.py`).

## Endpoint

- Dépendance d'auth : `Depends(require_permission("resource:action"))`. N'utiliser
  `get_current_user` seul que pour des routes « soi-même » (profil, préférences),
  avec contrôle d'appartenance explicite.
- Tenant : `tenant_id = resolve_current_tenant_id(request, current_user, db)` puis
  filtre explicite `Model.tenant_id == tenant_id` sur **chaque** requête.
- Pagination bornée : `limit: int = Query(50, ge=1, le=100)` (ou `le=500` pour
  les listes de référence, voir l'existant). Jamais de liste non bornée.
- Entrées : schéma Pydantic (`app/schemas/`), UUID typés, énumérations validées.
- FK reçues : charger l'entité liée **filtrée par tenant** ; 404 si absente.
- Rôles personnels : PARENT ne voit que ses enfants (`parent_student`), STUDENT
  que lui-même, TEACHER que ses classes/affectations. S'inspirer des tests
  `test_*ownership*`, `test_*idor*`.
- Opérations sensibles : `log_audit(db, user_id, tenant_id, action, resource_type, resource_id, details, ip_address, severity)`.
- Créations financières / messages : idempotence via
  `get_idempotent_response_or_lock` / `store_idempotent_response` (`core/idempotency.py`).
- Erreurs : `NotFoundError`, `ForbiddenError`, `ConflictError`… (`core/exceptions.py`)
  ou `HTTPException` ; messages en français ; jamais de détail SQL/trace au client.
- `text()` : `text("... WHERE id = :id")` + paramètres. Fragment dynamique
  (tri, colonne) seulement depuis une allowlist codée en dur.

## Transactions

- Un `db.commit()` par opération logique ; `db.rollback()` dans les chemins
  d'erreur qui continuent. Ne pas avaler l'exception.
- Pas de requête dans une boucle sur une liste potentiellement longue (N+1) :
  `joinedload` / `selectinload` ou requête groupée.

## Jobs asynchrones

Voir `docs/ASYNC_JOBS_GUIDE.md`. Résumé :
- Enqueue : `await enqueue_job("task_name", tenant_id=..., ...)` (`core/jobs.py`).
- Dans la tâche : `with worker_db_session(tenant_id) as db:` — jamais `SessionLocal()` direct.
- Tâche idempotente (rejouable), logs avec `tenant_id` et identifiant de job.

## Configuration

- Nouvelle variable : `Settings` dans `core/config.py` via `get_secret("NAME", default)`,
  validation si critique, et ajout dans `.env.example`, `.env.docker.example`,
  `.env.production.template` (valeurs factices uniquement).
- Spécifique fournisseur cloud : derrière l'abstraction existante (ex. `core/storage.py`).

## Dépendances

`backend/requirements.txt` : ajout = changement important (plan + accord).
Toujours borner la version (`>=x,<y`) et justifier en commentaire, comme l'existant.

## Vérification minimale

```bash
cd backend
python -m py_compile app/<fichier>.py
python -m pytest tests/test_<domaine>*.py -q
```
