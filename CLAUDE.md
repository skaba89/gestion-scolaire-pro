# Academy Guinéenne — Instructions Claude Code

ERP scolaire SaaS **multi-tenant** (écoles, lycées, universités, centres de
formation, tutelle ministérielle). Données de mineurs et données financières :
la sécurité et l'isolation entre établissements priment sur la vitesse.

Instructions spécialisées chargées automatiquement :
- `backend/CLAUDE.md` — FastAPI, SQLAlchemy, Alembic, RLS, tests pytest
- `src/CLAUDE.md` — React, RBAC front, i18n, tests Vitest

Workflow détaillé, agents, skills et commandes : `docs/CLAUDE_CODE_WORKFLOW.md`.

## Stack réelle

| Couche | Technologie |
|---|---|
| Frontend | React 18, Vite 5, TypeScript 5.8, Tailwind 3.4, shadcn/Radix, React Query 5, Zustand, react-router 7, i18next (fr/en/es/ar/zh), Capacitor 8, PWA + Dexie (hors-ligne) |
| Backend | FastAPI, SQLAlchemy 2.0 (**sessions synchrones**), Pydantic 2, Alembic, slowapi, ARQ (worker Redis), WeasyPrint |
| Données | PostgreSQL 16 avec **Row-Level Security**, Redis 7, stockage objet (MinIO en local, Azure Blob en cloud — voir `docs/STORAGE_ARCHITECTURE.md`) |
| Auth | JWT natif HS256 (`iss`/`aud`), bcrypt, TOTP + codes de secours, révocation Redis (jti + `token_version`) |
| IA | Groq par défaut (autres fournisseurs optionnels dans `backend/app/core/config.py`) |
| Prod | Images immuables (release = SHA Git, déployées par digest). **Production actuelle : Azure App Service** (api / worker / frontend, `deploy-appservice.yml`) + PostgreSQL Neon (pooler) + Redis managé ; rôles runtime `schoolflow_api` / `schoolflow_worker` (NOBYPASSRLS), `neondb_owner` réservé à l'administration et aux migrations. Azure Container Apps (`infra/azure/`, `deploy-azure.yml`) = cible préparée ; `render.yaml` / `netlify.toml` / `server.mjs` = cibles héritées. État daté : `docs/STATUT_ACTUEL.md` |
| Versions | Node : voir `.nvmrc` — Python 3.11 |

## Règles d'or (non négociables)

1. **Pas de changement important sans plan validé** (voir « Workflow »).
2. **Isolation tenant** : tout endpoint tenant utilise `require_permission("resource:action")`
   **et** `resolve_current_tenant_id(request, current_user, db)`. Jamais
   `current_user["tenant_id"]` en direct dans un nouvel endpoint. Toute FK reçue
   du client est vérifiée comme appartenant au tenant courant (anti-IDOR).
3. **RBAC = 3 sources à garder synchrones** : `backend/app/core/security.py`
   (`ROLE_PERMISSIONS`, fait autorité), `src/lib/permissions.ts` (affichage),
   `docs/PERMISSIONS_MATRIX.md`. Le backend décide ; le frontend ne fait que masquer.
4. **Migrations** : jamais modifier une migration existante de
   `backend/alembic/versions/` ; jamais de DDL ni d'Alembic au démarrage de
   l'API/worker (migrations = étape de déploiement séparée). Ne pas modifier
   `backend/app/core/operational_tables.py` : une migration historique l'importe.
5. **SQL** : paramètres liés uniquement. Jamais de valeur utilisateur
   interpolée dans `text(f"...")`.
6. **Pas de dégradation silencieuse** : pas de nouveau `except Exception: pass`
   ni de fallback qui masque une dépendance absente — logger et/ou échouer.
7. **Secrets** : ne jamais lire, afficher, copier ni committer `.env*` (hors
   `*.example` / `*.template`), `infra/backups/`, `azure-logs*`, clés, tokens,
   connection strings. Ne jamais mettre d'identifiants dans une commande.
8. **Paiements** : Mobile Money / moyens locaux uniquement. **Ne pas réintroduire
   Stripe** ni paiement par carte. Ne pas utiliser `@supabase/supabase-js`.
9. **Toute correction de sécurité s'accompagne d'un test de régression**
   (cross-tenant, IDOR, rôle non autorisé).
10. **Rester générique sur le cloud** : n'écrire du code spécifique à un
    fournisseur que derrière une abstraction existante (`core/storage.py`, config).

## Opérations interdites sans validation explicite de l'utilisateur

Bloquées ou soumises à confirmation par `.claude/settings.json` + `.claude/hooks/` :
- `git push` (et toujours interdit en `--force` sur `main`), suppression de branche,
  `git reset --hard`, `git clean`, `git rebase`, réécriture d'historique ;
- `alembic upgrade|downgrade|stamp`, SQL `DROP` / `TRUNCATE` / `DELETE` massif ;
- `docker compose down -v`, suppression de volumes ;
- tout déploiement, toute commande cloud (`az`, `gh workflow run`, `terraform`…) ;
- modification de : auth, RBAC, RLS/`database.py`, middlewares, config,
  CI (`.github/`), infra (`infra/`, `docker*`, `Dockerfile*`), dépendances ;
- appels HTTP mutants vers un environnement non local.

## Workflow officiel

```
REQUEST → ANALYSIS → PLAN → HUMAN VALIDATION → ARCHITECTURE CHECK → IMPLEMENTATION
→ TESTS → SECURITY REVIEW → CODE REVIEW → REGRESSION CHECK → DOCUMENTATION → SHIP
```

**Changement important** (toujours le workflow complet, arrêt obligatoire après PLAN) si l'un est vrai :
auth/MFA/tokens · RBAC/permissions · RLS/tenant · migration/schéma · finance/paiements ·
middleware · nouvel endpoint ou changement de contrat API · CI/infra/Docker ·
dépendances · suppression de code/données · plus de 3 fichiers de production touchés.

Pour ces changements : comprendre → lire le code concerné → plan écrit (fichiers,
impacts, risques, tests, rollback) → **attendre un « OK » explicite** → implémenter.

**Verrou technique** : `/feature`, `/fix`, `/project-plan`, `/new-endpoint` et
`/new-migration` posent un verrou HUMAN VALIDATION (hook `UserPromptSubmit`) qui
refuse toute écriture et toute commande non lecture-seule jusqu'à ce que
l'utilisateur réponde « OK » ou `/approve-plan` (`/cancel-workflow` pour abandonner).
Seul un message humain peut le lever ; ne jamais tenter de le contourner.

Petit changement (typo, libellé, test isolé, doc) hors commande de workflow :
circuit court IMPLEMENTATION → TESTS → CODE REVIEW, en le signalant.

Commandes : `/audit`, `/project-plan`, `/feature`, `/fix`, `/test`, `/project-review`,
`/project-security-review`, `/rbac-review`, `/performance-review`,
`/production-readiness`, `/ship` (+ `/approve-plan`, `/cancel-workflow`).
`/plan`, `/security-review` et `/review` (alias de `/code-review`) sont des
commandes **natives** de Claude Code — à ne pas confondre avec les nôtres.

## Definition of Done

Une tâche n'est **jamais** terminée parce que « ça compile ». Vérifier et rapporter :

- [ ] **Fonctionnalité** : le comportement demandé est démontré (test ou exécution réelle)
- [ ] **Tests** : nouveaux tests ajoutés ; suites concernées vertes (sortie citée)
- [ ] **Sécurité** : pas de secret, entrée validée, SQL paramétré, pas d'IDOR
- [ ] **RBAC** (si concerné) : permission + tenant + 3 sources synchronisées + test 403
- [ ] **Régression** : suites existantes vertes ; budget ESLint de `ci.yml` non dépassé ; `type-check` OK
- [ ] **Qualité** : code lisible, conforme aux conventions locales, pas de duplication
- [ ] **Documentation** : doc de référence et/ou `docs/STATUT_ACTUEL.md` mises à jour
- [ ] **Migrations** (si concerné) : nouvelle révision réversible, idempotente, une seule head
- [ ] **Configuration** (si concerné) : nouvelles variables dans `.env.example` (+ docker / template), validées dans `config.py`
- [ ] **Observabilité** (si nécessaire) : logs structurés, métriques, pas de PII dans les logs
- [ ] **Production readiness** (si nécessaire) : rollback décrit, impact déploiement connu

Si une case ne peut pas être vérifiée, le dire explicitement — ne jamais l'affirmer.

## Commandes de référence

```bash
# Frontend (racine)
npm ci --legacy-peer-deps          # --legacy-peer-deps obligatoire
npm run dev                        # Vite
npm run lint                       # ESLint (budget de warnings : voir .github/workflows/ci.yml)
npm run type-check                 # tsc --noEmit
npm run check:i18n                 # complétude des 5 locales
npx vitest run                     # tests unitaires
npm run test:e2e:smoke             # Playwright smoke
npm run build

# Backend (dans backend/)
pip install -r requirements.txt
python -m pytest tests/ -q                  # SQLite (pas de RLS réel)
python -m pytest tests/test_xxx.py -q       # ciblé
uvicorn app.main:app --reload --port 8000
alembic heads                               # doit afficher UNE seule head

# Stack locale
docker compose --env-file .env.docker up -d --build
```

Environnement Windows : Bash = Git Bash (syntaxe POSIX). Préférer des chemins relatifs.

## Configuration

- Templates (valeurs factices uniquement) : `.env.example`, `.env.docker.example`,
  `.env.production.template`. Les fichiers `.env*` réels ne sont jamais lus par Claude.
- Requis : `DATABASE_URL` (+ variantes `_SYNC` / `_ASYNC`, et `_MIGRATIONS` pour le rôle
  migrateur), `SECRET_KEY` (32+ caractères, refus de démarrer sinon), `ADMIN_DEFAULT_PASSWORD`,
  `BOOTSTRAP_SECRET` (l'API refuse de démarrer sans, hors DEBUG ; le worker n'en a pas besoin).
  Optionnels : `REDIS_URL`, stockage (`MINIO_*` / `AZURE_STORAGE_*`), `GROQ_API_KEY`, `SENTRY_DSN`…
  Liste et validations : `backend/app/core/config.py`.
- Frontend de production : `VITE_API_URL` au build, ou configuration runtime via
  `window.__SCHOOLFLOW_CONFIG__` (voir `src/api/client.ts`).

## Sources de vérité

| Sujet | Document |
|---|---|
| État réel du projet | `docs/STATUT_ACTUEL.md` |
| Sécurité, auth, RLS | `docs/SECURITY_MODEL.md`, `docs/POSTGRES_APP_ROLE.md` |
| Rôles & permissions | `backend/app/core/security.py`, `docs/PERMISSIONS_MATRIX.md`, `docs/INSTITUTIONAL_ROLES.md` |
| Migrations | `docs/MIGRATION_GUIDE.md`, `docs/AZURE_ONE_SHOT_MIGRATIONS.md` |
| Jobs async | `docs/ASYNC_JOBS_GUIDE.md` |
| CI / releases | `.github/workflows/`, `docs/IMMUTABLE_RELEASES.md` |
| Exploitation | `docs/OPERATIONS_RUNBOOK.md`, `docs/runbooks/`, `docs/DRP_GUIDE.md` |

Certains documents stratégiques sont signalés obsolètes par un bandeau : le code fait foi.

## Style

- Code et identifiants en anglais ; commentaires, messages d'erreur utilisateur et docs en français (style existant).
- Fichiers : kebab-case (composants React), snake_case (Python). Composants PascalCase.
- Endpoints : kebab-case avec slash final. Tables/colonnes : snake_case. Env vars : SCREAMING_SNAKE_CASE.
- Commits : Conventional Commits (`fix(security): …`, `feat(api): …`).
