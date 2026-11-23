# AGENTS.md — Academy Guinéenne (Codex et autres agents)

Ce fichier rend les règles du dépôt lisibles par Codex et tout agent qui lit `AGENTS.md`.
**Il ne remplace rien** : les règles qui font autorité sont dans les fichiers ci-dessous ;
en cas de divergence, ce sont eux qui s'appliquent.

| Sujet | Source qui fait autorité |
|---|---|
| Règles générales, règles d'or, opérations interdites, Definition of Done | `CLAUDE.md` |
| Backend (FastAPI, SQLAlchemy sync, Alembic, RLS, pytest) | `backend/CLAUDE.md` |
| Frontend (React, RBAC d'affichage, i18n, Vitest) | `src/CLAUDE.md` |
| Workflow, commandes, protections | `docs/CLAUDE_CODE_WORKFLOW.md` |
| État réel du projet (DEV / PROD) | `docs/STATUT_ACTUEL.md` |
| Risques ouverts et corrigés | `docs/audit/SECURITY_RISK_REGISTER.md` |
| Permissions | `backend/app/core/security.py` (autorité), `src/lib/permissions.ts`, `docs/PERMISSIONS_MATRIX.md` |

Lire les trois `CLAUDE.md` **en entier** avant toute modification.

## Différence importante avec Claude Code : aucune protection automatique

Sous Claude Code, des hooks (`.claude/hooks/`) **bloquent** les opérations dangereuses et
posent un verrou de validation humaine. **Codex n'exécute pas ces hooks.** Les mêmes règles
s'appliquent donc par discipline : un agent Codex doit s'arrêter et demander une
confirmation explicite là où Claude Code serait bloqué.

Ne jamais modifier `.claude/settings.json`, `.claude/hooks/`, `.claude/state/` ni ce
mécanisme de protection pour « faire passer » une action.

## Workflow obligatoire

```
REQUEST → ANALYSIS → PLAN → HUMAN VALIDATION → ARCHITECTURE CHECK → IMPLEMENTATION
→ TESTS → SECURITY REVIEW → CODE REVIEW → REGRESSION CHECK → DOCUMENTATION → SHIP
```

**Changement important** (auth/MFA, RBAC, RLS/tenant, migration, finance/paiements,
middleware, nouvel endpoint ou contrat d'API, CI/infra/Docker, dépendances, suppression de
code ou de données, plus de 3 fichiers de production) : écrire le plan (fichiers, impacts,
risques, tests, rollback), **s'arrêter**, et attendre un « OK » explicite de l'humain.

## Interdit sans confirmation explicite de l'humain

- `git push`, merge, rebase, reset, clean, amend, suppression de branche ou de tag,
  réécriture d'historique ; **jamais** de push forcé sur `main`, **jamais** `--no-verify`.
- `alembic upgrade | downgrade | stamp`, SQL `DROP` / `TRUNCATE` / `DELETE` / `UPDATE` massif.
- `docker compose down -v`, suppression de volumes, suppression récursive.
- Tout déploiement, toute commande cloud (`az`, `terraform`, `kubectl`, `gh workflow run`…),
  toute requête HTTP mutante vers un hôte non local.
- Modifier : auth, RBAC, RLS/`database.py`, middlewares, `config.py`, CI (`.github/`),
  `infra/`, `docker*`, `Dockerfile*`, dépendances, templates d'environnement.

**Toujours interdit** : lire, afficher, copier ou committer `.env*` (hors `*.example` /
`*.template`), `infra/backups/`, `azure-logs*`, clés, jetons, chaînes de connexion ; modifier
une migration existante de `backend/alembic/versions/` ; modifier
`backend/app/core/operational_tables.py` ; réintroduire Stripe ou `@supabase/supabase-js`.

## Règles de code non négociables (résumé de `CLAUDE.md`)

1. Endpoint tenant : `require_permission("resource:action")` **et**
   `resolve_current_tenant_id(request, current_user, db)` ; toute FK reçue du client vérifiée
   dans le tenant (anti-IDOR) ; périmètre par cycle via `app/core/cycle_scope.py` et
   classement de la route dans `app/core/cycle_routes.py`.
2. SQL : paramètres liés uniquement, jamais de valeur utilisateur dans `text(f"...")`.
3. Pas de dégradation silencieuse : pas de `except Exception: pass`, pas de zéros ni de
   données fictives à la place d'une erreur.
4. Toute correction de sécurité s'accompagne d'un test de régression, **rouge avant le
   correctif** (cross-tenant, IDOR, rôle non autorisé).
5. RBAC : les 3 sources restent synchronisées ; le backend décide, le frontend masque.

## Branches, commits, PR

- Ne jamais travailler directement sur `main`. Une branche `feature/…` ou `fix/…` par lot.
- Conventional Commits, messages en français (style existant). Pas de commit « wip » :
  le dépôt fusionne en squash et le premier message devient le titre sur `main`.
- PR petites et documentées ; une PR n'est fusionnable qu'avec les **6 contrôles CI verts**
  (Backend, Backend Tests PostgreSQL, Frontend, Browser Smoke, E2E Journeys, Security Scan).
- Ne jamais baisser un seuil CI, supprimer ou affaiblir un test pour obtenir une CI verte.

## Vérifications avant de déclarer une tâche terminée

```bash
# Frontend (racine)
npm ci --legacy-peer-deps
npm run lint            # budget de warnings : .github/workflows/ci.yml
npm run type-check
npm run check:i18n
npx vitest run
npm run build

# Backend (backend/)
python -m pytest tests/ -q           # SQLite : supprimer backend/test.db* avant (état résiduel)
alembic heads                        # une seule head
```

Tests PostgreSQL/RLS : sur une **base jetable** (conteneur dédié, base neuve à chaque passe),
jamais sur une base partagée ni de production. Citer les sorties réelles ; ne jamais
affirmer un résultat non exécuté. Distinguer : codé, testé, fusionné, déployé, validé terrain.

## Production

La production (VPS OVH, Docker Compose) se met à jour par `deploy/vps/deploy.sh`, qui
déploie le `main` du moment. **Aucun déploiement sans accord explicite**, sauvegarde
préalable faite par l'humain, et migrations exécutées comme étape séparée. Sur le VPS de
production, le checkout principal est celui de la production : y travailler dans un
`git worktree`, jamais en changeant sa branche. Voir `deploy/vps/README.md`.
