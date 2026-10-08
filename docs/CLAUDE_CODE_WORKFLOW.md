# Workflow Claude Code — Academy Guinéenne

Ce document explique aux humains comment l'environnement Claude Code du dépôt est
organisé et comment l'utiliser. Les règles elles-mêmes vivent dans `CLAUDE.md`
(racine, `backend/`, `src/`) et dans `.claude/` — ce document ne les duplique pas.

Validé contre Claude Code **2.1.289** (champs de frontmatter d'agent, forme exec
des hooks, commandes natives).

## 1. Pipeline officiel

```
REQUEST
  → ANALYSIS            comprendre la demande, lire le code concerné
  → PLAN                fichiers, impacts, risques, tests, rollback
  → HUMAN VALIDATION    ⛔ verrou technique : seul un « OK » humain le lève
  → ARCHITECTURE CHECK  cohérence avec l'architecture et les invariants
  → IMPLEMENTATION      strictement dans le périmètre du plan
  → TESTS               nouveaux tests + suites concernées (sorties réelles)
  → SECURITY REVIEW     auth, tenant/IDOR, injection, secrets, PII
  → CODE REVIEW         correction, qualité, conformité au plan
  → REGRESSION CHECK    suites complètes, lint, type-check, i18n, build, migrations
  → DOCUMENTATION       docs de référence mises à jour
  → SHIP                Definition of Done, puis commit/PR sur confirmation
```

**Changement important** = auth/MFA/tokens, RBAC, RLS/tenant, migration, finance,
middleware, nouvel endpoint ou contrat API, CI/infra/Docker, dépendances,
suppression de code ou de données, ou plus de 3 fichiers de production.
Pour ceux-là, Claude ne passe **jamais** directement de REQUEST à IMPLEMENTATION.

### Le verrou HUMAN VALIDATION (imposé, pas seulement demandé)

1. L'utilisateur lance `/feature`, `/fix`, `/project-plan`, `/new-endpoint` ou
   `/new-migration`. Le hook `UserPromptSubmit` (`workflow-gate.mjs`) écrit
   `.claude/state/workflow.json` = `awaiting-approval`.
2. Tant que le verrou est posé, pour Claude **et ses sous-agents** :
   - `guard-files.mjs` refuse toute écriture de fichier du projet ;
   - `guard-commands.mjs` refuse toute commande hors liste blanche lecture-seule.
3. L'utilisateur répond exactement « OK » / « GO » ou `/approve-plan` → `approved`.
   Tout autre message (« ok mais… », demande de modification) laisse le verrou posé.
4. `/cancel-workflow` abandonne et lève le verrou.
5. Une validation ne vaut que pour **la session** qui l'a donnée et **12 h** au
   plus : au-delà (ou dans une nouvelle session), l'état passe à `expired` et le
   contexte de Claude indique qu'aucune validation n'est en cours. Un verrou en
   attente depuis plus de 24 h reste fermé, mais est signalé comme ancien
   (`/cancel-workflow` s'il est obsolète). Chaque transition est journalisée
   dans `.claude/state/history.jsonl` (local, non versionné).

Claude ne peut pas lever le verrou lui-même : seul un message humain déclenche
`UserPromptSubmit`, et toute écriture dans `.claude/state/` est refusée aux outils.

Petit changement hors commande de workflow (libellé, typo, test isolé, doc) :
circuit court IMPLEMENTATION → TESTS → CODE REVIEW, annoncé comme tel. Les
fichiers critiques restent soumis à confirmation (section 5).

## 2. Commandes (`.claude/commands/`)

| Commande | Étape(s) | Verrou | Écrit des fichiers ? |
|---|---|---|---|
| `/audit <périmètre>` | ANALYSIS | — | non |
| `/project-plan <changement>` | PLAN | oui | non |
| `/feature <demande>` | pipeline complet | oui | après validation |
| `/fix <bug>` | cause racine → plan → test → correctif → revue | oui | après validation |
| `/approve-plan` | HUMAN VALIDATION (équivaut à « OK ») | lève | — |
| `/cancel-workflow` | abandon | lève | non |
| `/arch-check` | ARCHITECTURE CHECK | — | non |
| `/implement` | IMPLEMENTATION (refuse sans plan validé) | — | oui |
| `/test` | TESTS | — | tests uniquement |
| `/project-security-review` | SECURITY REVIEW | — | non |
| `/rbac-review` | audit RBAC / tenant | — | non |
| `/performance-review` | revue performance | — | non |
| `/project-review` | CODE REVIEW | — | non |
| `/regression-check` | REGRESSION CHECK | — | non |
| `/docs` | DOCUMENTATION | — | docs uniquement |
| `/production-readiness` | go/no-go | — | non |
| `/ship` | SHIP (commit/PR sur confirmation, jamais de déploiement) | — | git, sur confirmation |
| `/new-endpoint`, `/new-migration` | gabarits guidés | oui | après validation |

**Collisions avec les commandes natives (vérifiées dans le binaire 2.1.289)** :
`/plan` (mode plan), `/security-review` (revue sécurité intégrée) et `/review`
(alias natif de `/code-review`) — nos commandes s'appellent donc `/project-plan`,
`/project-security-review` et `/project-review`. Le contrôle couvre les noms
**et les alias** natifs. Après une mise à jour de Claude Code, revérifier (`/help`)
qu'aucune nouvelle commande ou alias natif ne masque une des nôtres.

## 3. Agents (`.claude/agents/`)

| Agent | Outils | Restriction imposée par hook | Rôle |
|---|---|---|---|
| `architect` | Read, Grep, Glob, Bash | `readonly` | analyse, plan, architecture check |
| `ui-ux-reviewer` | Read, Grep, Glob, Bash | `readonly` | accessibilité, responsive, RTL, i18n |
| `database-reviewer` | Read, Grep, Glob, Bash | `readonly` | migrations, modèles, RLS, SQL |
| `security-reviewer` | Read, Grep, Glob, Bash | `readonly` | revue sécurité |
| `rbac-reviewer` | Read, Grep, Glob, Bash | `readonly` | permissions, tenant, appartenance |
| `performance-reviewer` | Read, Grep, Glob, Bash | `readonly` | N+1, index, cache, bundle |
| `code-reviewer` | Read, Grep, Glob, Bash | `readonly` | revue finale |
| `production-readiness-reviewer` | Read, Grep, Glob, Bash | `readonly` | régression finale, go/no-go |
| `test-engineer` | + Edit, Write | `tests` | écriture/exécution des tests |
| `backend-engineer` | + Edit, Write | protections globales | implémentation `backend/` |
| `frontend-engineer` | + Edit, Write | protections globales | implémentation `src/` |
| `devops-engineer` | + Edit, Write | protections globales | CI, Docker, IaC — ne déploie jamais |

Chaque agent restreint déclare dans son frontmatter un hook `PreToolUse`
(`guard-agent-scope.mjs`) :
- **`readonly`** : Edit/Write/MultiEdit/NotebookEdit refusés ; Bash/PowerShell
  limités à une liste blanche (`git status/diff/log/show/blame…`, `grep/rg/ls/cat/head/wc`,
  `python -m pytest`, `npx vitest run`, `npx eslint` sans `--fix`, `npx tsc --noEmit`,
  `npm run lint/type-check/check:i18n/test/build`, `alembic heads/history/current`).
  Refusés : redirections vers un fichier, `sed -i`, `tee`, substitutions `$(…)`,
  `find -delete/-exec`, `python -c`, toute commande Git qui écrit, installation, migration.
- **`tests`** : mêmes règles Bash ; écriture autorisée uniquement dans
  `backend/tests/`, `tests/`, `src/**/__tests__/`, `*.test.*`, `*.spec.*`.

Liste blanche partagée : `.claude/hooks/lib/readonly.mjs`.

## 4. Skills (`.claude/skills/`)

Connaissances chargées à la demande par Claude ou les agents. Chacun renvoie vers
la documentation existante, qui reste la source de vérité.

`architecture-guide` · `backend-guide` · `frontend-guide` · `ui-ux-guide` ·
`database-guide` · `security-guide` · `rbac-guide` · `testing-guide` ·
`performance-guide` · `devops-guide` · `production-readiness-guide` · `review-guide`

## 5. Protections (`.claude/settings.json` + `.claude/hooks/`)

Trois couches : règles de permission (allow / ask / deny), hooks globaux
(`UserPromptSubmit` → `workflow-gate.mjs` ; `PreToolUse` → `guard-files.mjs`,
`guard-commands.mjs`) et hooks propres aux agents (`guard-agent-scope.mjs`).
Node, sans dépendance. Hooks déclarés en **forme exec** (`command: node` +
`args: ["${CLAUDE_PROJECT_DIR}/…"]`) : aucun shell intermédiaire, donc même
comportement sous Git Bash et PowerShell.

| Catégorie | Comportement |
|---|---|
| `.env*` réels, clés (`.pem`, `.key`…), `infra/backups/`, `azure-logs*` | **refusé** (lecture, écriture, `cat`/`type`/`Get-Content`…, globs `.env*`, `$(cat …)`, `xargs`, `find -exec`, redirection `< .env`). Analyse par segment de commande, sur le programme et ses fichiers : le texte libre (messages `-m`/`--body`, heredocs, motifs `\.env` de grep/sed/rg) ne déclenche plus de refus |
| `grep -r` sans `--exclude='.env*'` | **confirmation explicite** (`rg` / `git grep` respectent `.gitignore`) |
| Modification d'une migration existante | **refusé** |
| Écriture dans `.claude/state/` (verrou) | **refusé** (la lecture — `ls`, `cat`, `git check-ignore` — reste permise) |
| Force push vers `main`/`master`, `--no-verify` | **refusé** |
| Toute écriture / commande non lecture-seule pendant le verrou HUMAN VALIDATION | **refusé** |
| Nouvelle migration ; `security.py`, `auth.py`, `mfa.py`, `database.py`, `tenant_resolution.py`, `config.py`, middlewares ; `src/lib/permissions.ts`, `AuthContext.tsx`, `api/client.ts` ; CI, infra, Docker, déploiement, dépendances, templates d'env, `.gitignore`, protections Claude | **confirmation explicite** |
| `git push` / commit / merge / rebase / reset / clean / amend / suppression de branche ou tag / réécriture d'historique | **confirmation explicite** |
| `alembic upgrade/downgrade/stamp`, SQL DROP/TRUNCATE/DELETE/UPDATE via psql, sqlite3, docker exec, python -c | **confirmation explicite** |
| `docker compose down -v`, volumes, suppression récursive | **confirmation explicite** |
| Commandes cloud/déploiement (`az`, `terraform`, `kubectl`, `gh workflow run`…), requêtes HTTP mutantes vers un hôte distant | **confirmation explicite** |

Couverture vérifiée par une suite de 118 cas simulés (tous conformes) lors de la
mise en place.

Limites connues :
- si `node` est absent du PATH, un hook échoue **sans bloquer** (comportement de
  Claude Code pour une erreur de hook) — Node est un prérequis du dépôt ;
- une syntaxe de commande exotique peut échapper aux motifs `ask` des hooks
  globaux (la liste blanche des agents et du verrou, elle, refuse par défaut) ;
- ces protections réduisent le risque, elles ne remplacent ni la revue humaine
  ni les protections de branche GitHub.

## 6. Fichiers versionnés / locaux

Versionnés : `CLAUDE.md`, `backend/CLAUDE.md`, `src/CLAUDE.md`,
`.claude/{agents,commands,skills,hooks}/`, `.claude/settings.json`, ce document.

Locaux (ignorés par `.gitignore` via `.claude/*`) : `.claude/settings.local.json`
(permissions personnelles), `.claude/state/` (verrou), `.claude/worktrees/`,
`.claude/launch.json`, `CLAUDE.local.md`.
Ne jamais y placer de secret ; ne jamais mettre d'identifiants dans une commande autorisée.

## 7. Maintenance

- Une règle change → la modifier à **un seul** endroit (doc de référence ou
  `CLAUDE.md`) et faire pointer les skills dessus.
- Nouveau domaine récurrent → nouveau skill court plutôt que grossir `CLAUDE.md`.
- Après une mise à jour de Claude Code : revérifier les collisions de commandes
  et le chargement des hooks (`/hooks`).
- Revoir ce dispositif après chaque incident ou faux positif gênant des hooks,
  en ajoutant le cas à `.claude/hooks/tests/hooks.test.mjs`
  (`node --test .claude/hooks/tests/`, sans dépendance, hors CI).
