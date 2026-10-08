# Rôle PostgreSQL non-superutilisateur pour l'application

> **État au 2026-10-05 — production App Service + Neon :** l'API tourne en
> `schoolflow_api` et le worker en `schoolflow_worker` (NOSUPERUSER,
> NOBYPASSRLS, via le pooler Neon). Procédure exécutée et résultats :
> `docs/runbooks/neon-runtime-role.md`. Le texte ci-dessous (Flexible Server,
> `schoolflow_app`, section « Ne pas encore activer en production ») décrit
> l'outillage d'origine et l'historique des correctifs ; il ne reflète pas
> l'état de la production Neon.

Ce document couvre `infra/azure/sql/create_app_role.sql` et le câblage
associé (`DATABASE_URL_MIGRATIONS`, `effective_migrations_url`) dans
`backend/app/core/config.py`, `backend/alembic/env.py`,
`backend/start.sh` et `backend/app/main.py`.

## Le risque que ceci adresse

`docs/SECURITY_MODEL.md` (section « Risques connus ») documentait
explicitement ce P1 : le rôle PostgreSQL utilisé en production doit être
vérifié non-superutilisateur, sinon la Row-Level Security (RLS) est un
théâtre de sécurité — `rolsuper` ou tout rôle `BYPASSRLS` ignore
purement et simplement toutes les politiques RLS, quelle que soit leur
correction. `app/main.py::_check_rls_bypass_role` diagnostique déjà ce
cas sur `/health/deep`, mais jusqu'à cette PR rien ne fournissait
concrètement un rôle applicatif restreint à utiliser à la place de
l'admin login.

## Architecture : deux rôles, deux usages

```
schoolflow_admin  (superutilisateur Flexible Server, existant)
    |
    +-- Alembic (DDL : CREATE/ALTER/DROP TABLE)
    +-- ensure_operational_tables() au démarrage (DDL brut, tables sans modèle ORM)
    |   -> DATABASE_URL_MIGRATIONS (nouveau, optionnel)

schoolflow_app    (nouveau, non-superutilisateur, NOBYPASSRLS)
    |
    +-- toutes les requêtes applicatives à l'exécution (SELECT/INSERT/UPDATE/DELETE)
        -> DATABASE_URL / DATABASE_URL_SYNC / DATABASE_URL_ASYNC
```

- `schoolflow_app` n'a **aucun privilège DDL** — `GRANT SELECT, INSERT,
  UPDATE, DELETE ON ALL TABLES` et `GRANT USAGE, SELECT ON ALL SEQUENCES`
  uniquement (les séquences sont nécessaires pour toute colonne
  `SERIAL`/`IDENTITY`).
- `ALTER DEFAULT PRIVILEGES FOR ROLE schoolflow_admin ...` fait que toute
  table créée par une future migration Alembic (exécutée par
  `schoolflow_admin`) accorde automatiquement les mêmes droits à
  `schoolflow_app` — sans ce réglage, il faudrait ré-exécuter
  `create_app_role.sql` après chaque migration.
- `effective_migrations_url` (dans `config.py`) est
  `DATABASE_URL_MIGRATIONS` si l'opérateur l'a définie, sinon
  `DATABASE_URL_SYNC` — c'est-à-dire le comportement actuel, inchangé,
  tant que `DATABASE_URL_MIGRATIONS` n'est pas explicitement positionnée.
  Alembic (`alembic/env.py`) et l'étape de fixup de schéma dans
  `start.sh` utilisent tous les deux `effective_migrations_url`, jamais
  directement `DATABASE_URL_SYNC`.
- `ensure_operational_tables()` (DDL brut pour des tables sans modèle
  SQLAlchemy, appelé au démarrage dans `main.py`) est également routé via
  `effective_migrations_url` — l'oubli de ce détail était un vrai bug
  trouvé pendant ce travail : cette fonction utilisait l'engine
  applicatif (potentiellement restreint) au lieu de l'engine
  d'administration.

## Procédure (manuelle, une fois par environnement)

Jamais exécuté automatiquement par une migration, un job CI ou un
template Bicep — volontairement, pour ne jamais changer silencieusement
les identifiants de connexion de l'application sans qu'un humain ait
validé chaque étape ci-dessous.

1. **Créer le rôle** en se connectant en tant qu'admin login (le même
   que `infra/azure/modules/postgres.bicep` → `administratorLogin`) :

   ```bash
   psql "$ADMIN_DATABASE_URL" \
     -v app_role_password="$(openssl rand -base64 32)" \
     -f infra/azure/sql/create_app_role.sql
   ```

   Le script est idempotent (re-exécutable pour une rotation de mot de
   passe) et accepte `-v app_role_name=...`, `-v admin_role_name=...`,
   `-v db_name=...` pour s'écarter des valeurs par défaut
   (`schoolflow_app`, `schoolflow_admin`, `schoolflow`).

2. **Mettre à jour les secrets Key Vault** `database-url`,
   `database-url-sync`, `database-url-async` pour utiliser
   `schoolflow_app` (et le mot de passe généré ci-dessus) au lieu de
   l'admin login.

3. **Ajouter un nouveau secret** `database-url-migrations` portant la
   chaîne de connexion **admin** (celle que ces trois secrets
   utilisaient avant l'étape 2) — Alembic et `ensure_operational_tables`
   en ont besoin pour continuer à exécuter du DDL.

4. **Redémarrer la révision Container Apps** pour que les nouvelles
   valeurs d'environnement soient prises en compte.

## ⚠️ Ne pas encore activer en production

Cette PR livre l'outillage (le script de création de rôle, le câblage
`DATABASE_URL_MIGRATIONS`, les tests) de façon strictement additive —
**rien de ce qui est actuellement déployé ne change** tant que les
étapes 1 à 4 ci-dessus ne sont pas exécutées manuellement. C'est
délibéré : des tests exhaustifs contre un vrai PostgreSQL 16, avec la
connexion applicative réellement pointée sur le rôle restreint, ont mis
en évidence des problèmes réels — deux corrigés dans une PR de suivi
(migration `20260928_0001`), un troisième qui reste un vrai risque non
résolu :

1. **(CORRIGÉ, migration `20260928_0001`) Le cast `::uuid` de chaque
   politique RLS plantait sur toute requête sans tenant.**
   `set_config('app.current_tenant_id', NULL, false)` — ce que
   `get_db()` exécute à chaque requête pour repartir d'un état propre —
   ne remet PAS le GUC personnalisé à `NULL` : il le redéfinit à une
   chaîne vide `''` (confirmé directement contre un PostgreSQL 16 réel,
   sans ORM). Chaque politique RLS créée par
   `20260224_0730_fdb89a2e3b4d_enable_rls.py` faisait
   `tenant_id = (current_setting('app.current_tenant_id', true))::uuid`
   — `(''::uuid)` lève `invalid input syntax for type uuid: ""` pour
   tout le balayage de lignes, sur `/auth/bootstrap/` ou toute requête
   SUPER_ADMIN par exemple. Invisible jusqu'ici car le rôle admin actuel
   est superutilisateur et bypass RLS entièrement, donc ce cast n'a
   jamais été réellement évalué en production ni dans la suite de
   tests existante.
2. **(CORRIGÉ, même migration) Une fois le cast corrigé, l'égalité
   simple rejetait encore les lignes sans tenant (comptes SUPER_ADMIN,
   `tenant_id IS NULL`).** En SQL, `NULL = NULL` vaut `NULL`, pas
   `TRUE` — donc même avec le cast corrigé, l'INSERT du compte
   SUPER_ADMIN lui-même (créé par `/auth/bootstrap/` avec
   `tenant_id=NULL`) était rejeté par sa propre politique
   `WITH CHECK`. Remplacé `=` par `IS NOT DISTINCT FROM` (égalité
   NULL-safe de PostgreSQL), qui vaut `TRUE` pour NULL vs NULL tout en
   restant strictement équivalent à `=` pour deux valeurs non-nulles —
   vérifié que l'isolation inter-tenant reste intacte (un tenant réel
   ne voit toujours pas les lignes `tenant_id IS NULL`, et
   réciproquement).
3. **(CORRIGÉ, PR `fix(security): propagate tenant RLS context through
   ARQ workers`) `app/workers/tasks.py` ne fixait jamais le contexte
   RLS.** Voir la section « Propagation du contexte RLS dans les workers
   ARQ » ci-dessous pour l'architecture complète et le détail de la
   correction. **Important** : cette correction ne suffit pas à elle
   seule à rendre `schoolflow_app` activable — un quatrième problème, plus
   grave, a été découvert pendant ce travail et casse l'authentification
   HTTP elle-même sous le rôle restreint (point 4 ci-dessous).
4. **(CORRIGÉ, PR `fix(security): make authentication RLS-safe under
   restricted DB role`) `app/core/security.py::get_current_user()` cassait
   l'authentification de tout utilisateur tenant-scopé sous le rôle
   restreint.** Voir la section « Authentification RLS-safe sous le rôle
   restreint » ci-dessous pour l'architecture complète, l'audit exhaustif
   des sessions DB indépendantes qui l'accompagnait, et le détail de
   chaque correction (`get_current_user`, `/auth/login/`, `/auth/refresh/`,
   `/mfa/login/verify/`, `/auth/change-password/`,
   `/auth/reset-forced-password/`, les vérifications d'unicité d'email à
   l'inscription, `/users/me/`, et l'authentification WebSocket de
   `realtime.py`).

## Authentification RLS-safe sous le rôle restreint (PR `fix(security): make authentication RLS-safe under restricted DB role`)

**Contexte.** La PR précédente (ARQ workers) avait découvert mais délibérément
laissé hors périmètre un bug plus grave : `get_current_user()` — le
dependency FastAPI utilisé sur la quasi-totalité des routes HTTP protégées
— cassait l'authentification de tout utilisateur tenant-scopé sous le rôle
restreint. Cette PR ferme ce bug, et l'audit exhaustif qu'il a demandé a
mis au jour toute une famille de bugs de la même nature ailleurs dans la
base de code.

### Audit exhaustif des sessions DB indépendantes

Recherche de toute création de session DB pouvant contourner `get_db()`
(`SessionLocal()`, `sessionmaker`, `AsyncSession`, middlewares, scripts,
cron, WebSocket, health/security checks) :

| Chemin / fonction | Source de session | Scope | Source du tenant | Contexte RLS avant | Correction | Test |
|---|---|---|---|---|---|---|
| `get_current_user()` | `SessionLocal()` indépendante | HTTP, tenant-scoped | claim `tenant_id` du JWT | reset inconditionnel à NULL (bug) | `resolve_authenticated_user_row(db, user_id, token.get("tenant_id"))` | `test_login_tenant_a_then_protected_route_returns_200` |
| `POST /auth/login/` | `get_db()` (mais `/auth/*` est exempté de `TenantMiddleware`) | HTTP, platform-scoped par nécessité (`email`/`username` uniques globalement) | aucun (pré-auth) | aucun contexte positionné | `find_user_in_owner_tenant(by="login")` (coût constant, 20261009_0001) puis `switch_tenant_context()` vers le tenant trouvé | `test_login_*`, `test_second_tenants_user_can_also_log_in` |
| `POST /auth/refresh/` | `get_db()` (`/auth/refresh` exempté) | HTTP, tenant-scoped | claim `tenant_id` du token expiré | aucun contexte positionné | `resolve_authenticated_user_row(db, user_id, payload.get("tenant_id"))` | tests existants `test_token_lifecycle.py` (non-régression) |
| `POST /mfa/login/verify/` | `get_db()` (`/mfa/login/verify` exempté) | HTTP, tenant-scoped | aucun (le token `mfa_pending` ne porte pas `tenant_id`) | aucun contexte positionné | `find_user_in_owner_tenant(by="user_id")` puis `switch_tenant_context()` | tests existants `test_totp_mfa_login.py` (non-régression) |
| `POST /auth/change-password/`, `POST /auth/reset-forced-password/` | `get_db()` (`/auth/*` exempté) | HTTP, tenant-scoped (self-lookup) | `current_user["tenant_id"]` (déjà résolu) | aucun contexte positionné | `resolve_authenticated_user_row(db, user_id, current_user.get("tenant_id"))` | tests existants (non-régression) |
| Vérification d'unicité d'email — `POST /auth/register/`, `POST /auth/create-with-admin/` | `get_db()` (`/auth/*` exempté) | HTTP, platform-scoped par nécessité | aucun (pré-auth) | aucun contexte positionné | `find_user_in_owner_tenant(by="email_ci")` | tests existants d'inscription (non-régression) |
| `POST /auth/reset-password/` (lien de réinitialisation) | `get_db()` (`/auth/*` exempté) | HTTP, tenant-scoped | aucun (`user_id` stocké dans Redis, sans tenant) | aucun contexte positionné | `find_user_in_owner_tenant(by="user_id")` puis `switch_tenant_context()` (nécessaire aussi pour que l'`UPDATE` du mot de passe ne soit pas silencieusement filtré par `WITH CHECK`) | `test_account_provisioning.py` (mock mis à jour) |
| `GET /users/me/` | `get_db()` (`/users/me` est dans la liste `public_paths` de `TenantMiddleware` — "résout son propre tenant, pas via le contexte RLS") | HTTP, tenant-scoped (self-lookup, SQL brut) | `current_user["tenant_id"]` (déjà résolu) | aucun contexte positionné | `switch_tenant_context(db, current_user["tenant_id"])` / `reset_tenant_context(db)` avant les requêtes SQL brutes | `test_login_tenant_a_then_protected_route_returns_200`, `test_token_a_cannot_use_x_tenant_id_header_to_reach_tenant_b` |
| WebSocket `app/api/v1/endpoints/core/realtime.py::websocket_endpoint` | `SessionLocal()` indépendante | WebSocket, tenant-scoped | claim `tenant_id` du JWT (`token_tenant`) | aucun reset du tout (pire : hérite de l'état laissé par une connexion précédente du pool) | `resolve_authenticated_user_row(db, token_sub, token_tenant)` | `test_websocket_tenant_a_connects_successfully`, `test_websocket_tenant_a_token_denied_for_tenant_b_path` |
| `app/scripts/expire_subscriptions.py` / `expire_overdue_subscriptions()` | `SessionLocal()` indépendante (script) et `get_db()` (endpoint `POST /billing/maintenance/expire/`) | Cron + HTTP, platform-scoped (balaie tous les tenants) | aucun | une seule requête globale sur `tenant_subscriptions` (politique RLS stricte, sans bypass) → 0 ligne visible | `platform_db_session()` (script) + boucle par tenant avec `switch_tenant_context()`/`reset_tenant_context()` (fonction elle-même, pour couvrir aussi l'appel HTTP) | `test_expire_overdue_subscriptions_works_across_tenants_under_restricted_role` |
| `require_plan()`, `app/main.py` (bootstrap admin, health/security checks), `app/scripts/seed_saas_plans.py`, `app/api/v1/endpoints/core/webhooks.py::_dispatch_webhooks` | `SessionLocal()` indépendante | Platform-scoped (tables racines sans `tenant_id`/RLS : `tenants`, `subscription_plans`, catalogues système `pg_roles`/`pg_class`) ou code mort (`webhooks` : aucune migration, aucun modèle) | — | — | Aucune correction nécessaire — confirmé sans risque RLS. `require_plan()` est fail-closed (403 `TENANT_NOT_FOUND` tenant introuvable / 503 erreur DB) ; absence de RLS sur `tenants` figée par `test_auth_rls_restricted_role.py` | Audit manuel, inchangé depuis la PR ARQ workers |
| ~~`mfa_totp_secrets`/`mfa_backup_codes` créées à la volée par `_ensure_mfa_tables()`~~ | — | — | — | — | **CORRIGÉ (one-shot migrations P0)** : `_ensure_mfa_tables()` supprimée entièrement, `mfa_totp_secrets` migrée dans `20260930_0001_adopt_operational_tables_into_alembic.py`. Voir `docs/AZURE_ONE_SHOT_MIGRATIONS.md`. | `tests/test_totp_mfa_login.py`, `tests/test_mfa_enforcement.py` |

### Architecture cible (identique à la cible ARQ workers, étendue à l'authentification)

```
HTTP (route normale)   : Requête -> TenantMiddleware (JWT.tenant_id) -> tenant_context -> get_db() -> set_config -> get_current_user() (session partagée) -> RLS
HTTP (/auth/*, exempté): Requête -> aucun tenant_context -> get_db() (contexte vide) -> find_user_in_owner_tenant() ou resolve_authenticated_user_row() -> switch_tenant_context() -> RLS
WEBSOCKET               : Connexion -> JWT.tenant_id -> SessionLocal() indépendante (TenantMiddleware ne s'exécute jamais pour un WebSocket) -> resolve_authenticated_user_row() -> RLS
CRON / HTTP admin       : platform_db_session()/get_db() -> liste des tenants (table racine, sans RLS) -> switch_tenant_context() par tenant -> RLS -> reset_tenant_context()
```

### Deux nouvelles abstractions dans `app/core/database.py`, réutilisant celles de la PR ARQ workers

- **`resolve_authenticated_user_row(db, user_id, tenant_id)`** — pour un
  utilisateur dont on connaît déjà l'identité (`user_id`) ET le tenant
  probable (`tenant_id`, typiquement le claim JWT ou
  `current_user["tenant_id"]`). Essaie ce contexte en premier (le cas
  normal — trouve immédiatement un utilisateur tenant-scopé), puis
  retombe sur `NULL` uniquement si ça échoue (le seul cas légitime : un
  compte platform-scoped — `SUPER_ADMIN`, ... — dont la ligne
  `tenant_id IS NULL` est invisible sous n'importe quel autre contexte,
  par exemple pendant une impersonation via `X-Tenant-ID`). Restaure le
  contexte à `tenant_id` avant de retourner, pour que le reste de la
  session partagée (`get_db()`) continue de voir le bon tenant.
- **`find_user_in_owner_tenant(db, query_fn, by=..., value=...)`** (depuis
  la migration `20261009_0001`) — remplace le parcours ci-dessous pour les
  recherches pré-authentification (login, inscription, réinitialisation,
  MFA, création de tenant). Trois fonctions `SECURITY DEFINER`
  (`resolve_user_tenants_by_login|by_email_ci|by_id`, `search_path` figé)
  renvoient **uniquement** le(s) `tenant_id` propriétaire(s) ; la ligne
  `users` elle-même est ensuite lue une fois, sous le contexte RLS de ce
  tenant, par la politique stricte habituelle. Coût constant (quelques
  allers-retours) quel que soit le nombre de tenants, au lieu de 2N+1 sur
  des endpoints anonymes. Tests : `test_user_tenant_resolution_postgres.py`.
- **`find_user_across_all_tenants(db, query_fn)`** — conservé pour les
  recherches SUPER_ADMIN par identifiant (abonnement, domaine) ; un
  parcours lent (> 500 ms) est journalisé (`Slow tenant sweep`). Pour un utilisateur
  dont on ne connaît ni le tenant, ni même s'il en a un (login par email,
  vérification d'unicité à l'inscription, token de réinitialisation de
  mot de passe stocké dans Redis sans tenant). `users.email` et
  `users.username` sont **globalement uniques** (un compte par identité,
  pas par tenant — voir `app/models/user.py`), donc cette recherche est
  intrinsèquement transverse à tous les tenants. Plutôt que d'ajouter un
  bypass RLS général sur `users` (ce qui affaiblirait réellement RLS —
  `users` porte des identifiants/PII et n'a délibérément aucun bypass
  platform-wide, contrairement à `jobs`/`notification_events`), cette
  fonction cherche **explicitement**, un tenant à la fois, en réutilisant
  `switch_tenant_context()`/`reset_tenant_context()` — exactement le même
  mécanisme que `check_inactive_tenants`/`expire_overdue_subscriptions`.
  Essaie d'abord le contexte `NULL` (cas courant et bon marché : un
  compte platform-scoped), puis boucle sur chaque tenant jusqu'au premier
  match (`email`/`username` étant uniques, il ne peut jamais y en avoir
  plus d'un sur toute la plateforme). `O(n)` dans le nombre de tenants au
  pire cas — acceptable pour des endpoints déjà limités en débit
  (bcrypt, rate limiting), à ne jamais réutiliser sur un chemin chaud.

### Pourquoi ne pas juste faire de `get_current_user()` une dépendance de `get_db()`

Tentative initiale, abandonnée : cela cassait ~26 tests existants
(`tests/test_auth_revocation_fail_closed.py`,
`tests/test_auth_roles_db_source_of_truth.py`) qui appellent
`get_current_user()` directement comme une coroutine ordinaire
(`await get_current_user(request=..., token=...)`), en dehors du système
d'injection de dépendances de FastAPI — un paramètre
`db: Session = Depends(get_db)` y reçoit littéralement l'objet sentinelle
`Depends(...)`, pas une vraie session. `get_current_user()` garde donc sa
propre session indépendante, mais positionnée correctement dès le départ
via le claim `tenant_id` du JWT plutôt que remise à `NULL`
inconditionnellement.

### Non-contamination du pool de connexions

> **Mise à jour 2026-10-04 — pooler en mode transaction.** Le contexte n'est
> plus posé au niveau de la session (`set_config(..., false)`) : derrière
> PgBouncer en mode transaction (endpoint `-pooler` de Neon), une valeur de
> session reste sur la connexion serveur et est héritée par le client
> suivant. `_set_rls_context()` mémorise désormais le tenant dans
> `Session.info` et le repose en `set_config(..., true)` au début de
> **chaque** transaction (`_reapply_rls_context_on_begin`, hook
> `after_begin`) ; rien ne survit à la fin d'une transaction. Preuves :
> `tests/test_rls_tenant_context_pooling.py` (connexion partagée
> `StaticPool`, entrelacement A→B→A, threads) et validation sur un vrai
> pooler Neon (branche de répétition). Le texte ci-dessous décrit la
> garantie d'origine ; la méthode (contexte repositionné avant toute
> requête) reste vraie, à l'échelle de la transaction.

Même garantie et même méthode de preuve que la PR ARQ workers : chaque
point d'entrée repositionne explicitement le contexte comme première
opération, sans jamais supposer d'état hérité. Testé explicitement (voir
`tests/test_auth_rls_restricted_role.py`) en forçant deux `POST
/auth/login/` consécutifs (tenant A puis tenant B) à réutiliser la même
connexion physique (`StaticPool`), puis en vérifiant que chaque token
donne bien accès au bon tenant sur `GET /users/me/` — aucune fuite dans
les deux sens.

### `X-Tenant-ID` et confiance dans le tenant du token

Le claim `tenant_id` du JWT est signé et dérivé côté serveur, depuis
`user_db.tenant_id`, à l'émission du token (`/auth/login/`,
`/mfa/login/verify/`) — jamais fourni ou modifiable par le client.
`TenantMiddleware` privilégie toujours ce claim ; le header `X-Tenant-ID`
n'est pris en compte QUE pour un `SUPER_ADMIN` sans `tenant_id` propre
(impersonation explicite d'un tenant par un compte platform-level), et
uniquement après vérification de l'existence du tenant ciblé. Testé
explicitement : un utilisateur normal (tenant A) qui envoie un header
`X-Tenant-ID` pointant vers le tenant B continue de voir uniquement le
tenant A (`test_token_a_cannot_use_x_tenant_id_header_to_reach_tenant_b`).

### WebSocket (`app/api/v1/endpoints/core/realtime.py`)

`TenantMiddleware` (un `BaseHTTPMiddleware`) ne s'exécute jamais pour une
connexion WebSocket — rien ne positionne `app.current_tenant_id` par ce
biais. L'ancien code n'appelait même pas `_set_rls_context` du tout,
héritant silencieusement de l'état laissé par une connexion précédente du
pool. Corrigé avec `resolve_authenticated_user_row(db, token_sub,
token_tenant)`, `token_tenant` étant le claim `tenant_id` du JWT fourni en
query param. Les protections de PR #254 (blacklist/révocation,
logout-all, `is_active`, rôles relus depuis la DB plutôt que depuis le
token) sont préservées à l'identique — aucune régression, `test_realtime_
websocket_revocation_2026_09_28.py` repasse sans modification.

### Cas SUPER_ADMIN / platform

Aucun bypass général n'a été créé pour `SUPER_ADMIN` ou tout autre rôle
platform-level. Ces comptes (`tenant_id IS NULL` en base) restent
visibles à leur propre requête d'authentification exactement comme avant
(contexte `NULL`), sans traitement de faveur au niveau RLS — la seule
différence est que `resolve_authenticated_user_row()`/
`find_user_across_all_tenants()` essaient maintenant le **bon** contexte
en premier pour un utilisateur tenant-scopé, au lieu de forcer `NULL`
pour tout le monde.

## Propagation du contexte RLS dans les workers ARQ (PR précédente : `fix(security): propagate tenant RLS context through ARQ workers`)

**Problème.** Une requête HTTP passe systématiquement par `get_db()`, qui
positionne le contexte RLS (`set_config('app.current_tenant_id', ...)`) à
chaque requête à partir du tenant résolu par `TenantMiddleware` depuis le
JWT. Un job ARQ (`app/workers/tasks.py`) n'a aucun cycle de requête HTTP —
plusieurs jobs ouvraient `SessionLocal()` directement, sans jamais
positionner ce contexte. Invisible sous un rôle
superutilisateur/`BYPASSRLS` (RLS totalement ignorée), ceci serait devenu
bloquant ou silencieusement dangereux (mélange de données entre tenants)
sous `schoolflow_app`.

**Architecture cible.**

```
HTTP    : Requête -> JWT -> tenant_id -> get_db() -> set_config -> PostgreSQL -> RLS
WORKER  : Job ARQ -> payload {tenant_id, ...} -> worker_db_session(tenant_id)
              -> validation tenant_id -> set_config -> requêtes métier
              -> commit/rollback -> close()
```

**Abstraction centrale** (`app/core/database.py`), pour éviter de
dupliquer `set_config(...)` dans une vingtaine de fonctions :

- `worker_db_session(tenant_id)` — **la seule façon sanctionnée** d'ouvrir
  une session pour un job tenant-scopé. Fail-closed par construction :
  lève `TenantContextError` (jamais de session ouverte) si `tenant_id` est
  absent/vide, n'est pas un UUID syntaxiquement valide, ou ne correspond
  à aucun tenant existant en base — jamais de "tenant par défaut" ni de
  "premier tenant trouvé". Commit en sortie normale, rollback + re-raise
  sur exception, `close()` dans un `finally` dans tous les cas.
- `platform_db_session()` — pour un job réellement platform-scoped (par
  ex. `purge_expired_idempotency_keys`, qui doit atteindre des lignes de
  tous les tenants par date d'expiration). Fonction **séparée** de
  `worker_db_session(None)` : un job qui n'a pas de tenant doit le dire
  explicitement, pas se contenter d'un paramètre optionnel absent.
- `switch_tenant_context(db, tenant_id)` / `reset_tenant_context(db)` —
  pour un job platform-scoped qui traite plusieurs tenants l'un après
  l'autre sur la **même** session (ex. `check_inactive_tenants`, qui
  boucle sur tous les tenants actifs et doit lire leurs `audit_logs`
  chacun sous son propre contexte, `audit_logs` n'ayant aucun bypass
  platform-wide).

**Pourquoi `set_config(..., false)` (session-scoped) et pas `SET LOCAL`
(transaction-scoped)** : `get_db()` fait déjà ce choix pour les requêtes
HTTP ; `worker_db_session`/`platform_db_session` le reproduisent pour
rester cohérents avec le modèle transactionnel existant. Un job peut
committer plusieurs fois (ex. import CSV par lots) — `SET LOCAL`
reviendrait à vide après le premier commit, ce qui casserait le contexte
au milieu du job.

**Non-contamination du pool de connexions.** La garantie ne vient pas
d'un état "propre" présumé d'une connexion tout juste sortie du pool
(hypothèse dangereuse — le pool réutilise des connexions déjà porteuses
d'un contexte précédent), mais du fait que **chaque** appel à
`worker_db_session`/`platform_db_session` repositionne explicitement le
contexte comme première opération, sans jamais supposer quoi que ce soit
sur l'état hérité. Testé explicitement (voir
`tests/test_worker_rls_tenant_context.py`) : forcer deux appels
successifs à réutiliser la **même** connexion physique (pool à une seule
connexion) avec tenant A puis tenant B ne laisse fuiter aucune ligne de A
vers B, y compris en enchaînant `platform_db_session()` (aucun contexte)
suivi de `worker_db_session(tenant_a)`.

**Jobs corrigés dans `app/workers/tasks.py`** (tous les sites
`SessionLocal()` directs remplacés) : `deliver_payment_reminders`,
`import_students_job`, `import_parents_job`, `import_teachers_job`,
`generate_report_cards_batch_job`, `send_whatsapp_notification`,
`send_bulk_whatsapp_notifications`, `send_absence_alert_whatsapp_job`,
`send_grade_alert_whatsapp_job`, `send_bulletin_ready_whatsapp_job`,
`send_whatsapp_reply_job`, `send_public_form_submission_alert`,
`send_tenant_5xx_alert`, `retry_failed_notifications` (mixte : un
balayage tenant-scopé si `tenant_id` fourni, platform-scoped avec
`switch_tenant_context` par événement sinon), `sync_whatsapp_statuses`
(même schéma mixte), `_job_started`/`_job_finished` (helpers internes).
Jobs confirmés platform-scoped par conception, migrés vers
`platform_db_session()` : `purge_expired_idempotency_keys`,
`check_inactive_tenants` (avec `switch_tenant_context` par tenant pour la
lecture d'`audit_logs`, table sans bypass), `purge_old_public_form_submissions`.

**Deux bugs supplémentaires trouvés par le même audit, hors
`tasks.py`, corrigés dans cette PR** :

- `app/middlewares/quota.py::QuotaMiddleware._count_resources` ouvrait
  aussi `SessionLocal()` sans contexte (son propre docstring dit
  explicitement utiliser sa propre session pour ne pas dépendre de l'état
  injecté par le middleware — donc hors du cycle `get_db()`). Sous le
  rôle restreint, chaque comptage de quota aurait silencieusement
  retourné 0 (RLS masque toutes les lignes sans contexte) — un fail-open
  accidentel sur *chaque* appel, pas seulement en cas d'erreur réelle,
  contredisant l'intention documentée du fichier ("fail open by design"
  sur une erreur, pas sur un fonctionnement normal).
- `app/api/v1/endpoints/core/whatsapp_webhook.py::whatsapp_webhook_receive`
  (webhook Meta, sans JWT, tenant résolu depuis le payload) résolvait le
  tenant via `platform_db_session()` mais n'appelait jamais
  `switch_tenant_context()` avant que
  `whatsapp_service.process_webhook_event()` n'écrive dans
  `message_threads`/`message_items`/`notification_events` — ces écritures
  tenant-scopées tournaient donc sans aucun contexte. Corrigé en appelant
  `switch_tenant_context(db, tenant_id)` dès que le tenant est résolu,
  avant la vérification de signature et le traitement du payload.

**Un troisième bug RLS trouvé pendant ce travail, indépendant des
workers, corrigé par la migration `20260929_0001`** : 15 politiques RLS
de la famille « permissive » (ex. `jobs`, `notification_events`,
`idempotency_keys`) accordent une visibilité platform-wide via
`OR current_setting(...) IS NULL` quand aucun contexte n'est positionné.
Ce bypass casse silencieusement (retourne FAUX pour toujours) dès qu'une
connexion a exécuté `set_config(..., NULL, false)` **ne serait-ce
qu'une fois** — exactement ce que `platform_db_session()` (cette même
PR) fait sur chaque connexion qu'elle touche. Sans cette migration,
`_job_finished()` aurait cessé, de façon aléatoire selon l'état du pool,
de retrouver la ligne `jobs` du job qu'il vient lui-même de créer,
laissant les jobs bloqués à `RUNNING` indéfiniment sans jamais lever
d'erreur. Corrigé avec le même motif `NULLIF(..., '') IS NULL` que les
migrations précédentes. Détails et preuve dans
`tests/test_rls_platform_bypass_migration.py`.

**Propagation du `tenant_id` dans les payloads ARQ.** Audit de tous les
sites `enqueue_job(...)` : le `tenant_id` transmis à un job tenant-scopé
provient toujours d'une résolution côté serveur (tenant du JWT courant,
ou tenant résolu depuis un payload webhook signé), jamais directement
d'un champ arbitraire fourni par le frontend/la requête sans contrôle
serveur. Aucune correction nécessaire sur ce point.

**Précision importante, après investigation plus poussée** : la suite
backend complète, exécutée avec la connexion applicative sur
`schoolflow_app` (rôle restreint), produit encore un nombre d'échecs
important (de l'ordre de 900 tests) même après les deux corrections
ci-dessus. Une PR de suivi précédente décrivait cela comme un
« poisoning apparent du pool de connexions » supposant un `rollback()`
manquant quelque part — **ce diagnostic était imprécis**. La cause
réelle, confirmée en traçant un échec représentatif jusqu'au bout
(`tests/test_admission_timeline.py` et des dizaines de fichiers
similaires) : ces tests créent leurs données via
`with SessionLocal() as db: db.add(User(..., tenant_id=tenant_id))`,
c'est-à-dire **directement via l'ORM, en dehors de tout cycle de
requête HTTP**, sans jamais appeler `set_config`. Sous le rôle admin
(superutilisateur), RLS étant bypass, cela n'a jamais eu d'importance.
Sous le rôle restreint, une telle insertion échoue nécessairement — la
connexion réutilisée du pool ne porte pas le bon tenant, ou aucun —
comme la politique le prévoit correctement.

Ce n'est **pas un bug du code de production** : toute vraie requête
HTTP passe par `app/core/database.py::get_db()`, qui positionne
correctement le contexte tenant à chaque requête, sans exception. C'est
une limite du **harnais de tests** de ce dépôt — des dizaines de
fichiers créent des données de test en contournant délibérément l'API
pour aller plus vite, un choix raisonnable tant que RLS n'est jamais
réellement évaluée par la suite de tests, mais qui empêche de faire
tourner cette même suite contre le rôle restreint sans une refonte
significative des fixtures concernées (hors périmètre ici — risque de
régression bien plus large qu'une correction RLS ciblée).

Le point 3 (`app/workers/tasks.py`) reste, lui, un authentique risque de
**production**, puisque les jobs ARQ tournent réellement en dehors de
tout cycle de requête HTTP, contrairement aux tests.

**Tant que le point 3 n'est pas résolu**, exécuter les étapes 2-4
ci-dessus sur un environnement réel casserait silencieusement
l'isolation multi-tenant des jobs d'arrière-plan. Le scope volontairement
restreint des PR de ce chantier est donc :

- Le script de création de rôle (`create_app_role.sql`), validé de façon
  approfondie contre un vrai PostgreSQL 16 (création idempotente,
  rotation de mot de passe, refus du DDL pour ce rôle, héritage des
  droits par défaut pour les tables créées après coup).
- Le câblage `DATABASE_URL_MIGRATIONS`/`effective_migrations_url`, qui
  ne change rien tant qu'il n'est pas explicitement activé.
- La correction du bug `ensure_operational_tables` (DDL via le mauvais
  engine), un vrai problème indépendant de l'activation du rôle
  restreint.
- Les deux corrections RLS ci-dessus (migration `20260928_0001`), des
  bugs de production réels et indépendants de l'activation du rôle
  restreint (n'importe quel futur rôle non-superutilisateur, ou même un
  défaut de configuration futur, les aurait déclenchés).

La fermeture complète du risque P1 (rôle non-superutilisateur
**effectivement utilisé** en production) reste un travail de suivi,
conditionné à la résolution du point 3 ci-dessus — et, séparément, à
une revue des fixtures de test qui contournent `get_db()` si l'on
souhaite un jour faire tourner la suite de tests elle-même contre le
rôle restreint.

## Validation effectuée

- `psql` contre un PostgreSQL 16 local réel : création idempotente du
  rôle, rotation de mot de passe sur ré-exécution, refus explicite d'un
  `ALTER TABLE` tenté avec ce rôle, héritage correct des privilèges par
  défaut sur une table créée après l'exécution du script.
- `pytest backend/tests/test_database_url_migrations_2026_09_28.py
  backend/tests/test_start_sh_db_resolution.py` : tous les nouveaux tests
  passent (fallback vers `DATABASE_URL_SYNC` quand
  `DATABASE_URL_MIGRATIONS` est absente, normalisation du driver
  `psycopg`, `start.sh` utilise bien les identifiants admin pour l'étape
  de fixup de schéma quand `DATABASE_URL_MIGRATIONS` est définie, aucune
  fuite de mot de passe dans les logs).
- Suite backend complète contre PostgreSQL réel avec le rôle **admin**
  inchangé (comportement actuellement déployé), migration `20260928_0001`
  appliquée : **1857 passed, 1 skipped, 0 failed** — 0 régression.
- Suite backend complète (SQLite) : **1359 passed, 499 skipped, 0 failed**
  — 0 régression.
- Vérification manuelle directe (`psycopg`, sans ORM) sur une base
  portant le rôle restreint : l'INSERT du compte SUPER_ADMIN
  (`tenant_id=NULL`) réussit désormais, et un contexte tenant différent
  ne voit toujours pas cette ligne — l'isolation inter-tenant reste
  intacte après le passage à `IS NOT DISTINCT FROM`.
- Suite backend complète contre PostgreSQL réel avec la connexion
  applicative pointée sur le rôle **restreint** (`schoolflow_app`,
  expérimentation de due diligence, jamais activée par défaut) : passée
  de ~935 à ~877 échecs après les deux corrections RLS — la baisse est
  réelle mais plus faible qu'espéré, car la majorité des échecs
  restants viennent des fixtures de test contournant `get_db()`
  (voir ci-dessus), pas d'un bug de code applicatif supplémentaire.

## Validation de la PR précédente « propagate tenant RLS context through ARQ workers »

- `tests/test_worker_rls_tenant_context.py` (18 tests, rôle jetable
  `NOSUPERUSER NOBYPASSRLS`, `SessionLocal` d'`app.core.database`
  monkeypatché sur ce rôle pour exercer le vrai code de
  `worker_db_session`/`platform_db_session`, pas une réimplémentation) :
  rôle confirmé non-superutilisateur/`NOBYPASSRLS`, DDL refusé
  (`CREATE`/`ALTER`/`DROP TABLE`), tenant A lit sa propre ligne `jobs`,
  tenant A ne peut ni lire, ni modifier (`UPDATE` 0 ligne affectée), ni
  supprimer (`DELETE` 0 ligne affectée) la ligne de tenant B, `tenant_id`
  absent/vide/invalide/inexistant échoue fermé (`TenantContextError`,
  aucune session ouverte), non-contamination du pool vérifiée en forçant
  deux appels à réutiliser la même connexion physique (`StaticPool`) —
  tenant A puis tenant B, puis `platform_db_session()` puis
  `worker_db_session(tenant_a)`, aucune fuite dans les deux sens —,
  rollback sur exception vérifié (écriture non committée), session
  fermée après exception, un retry ARQ simulé (deux appels successifs
  avec le même `tenant_id` après un échec) retrouve le bon tenant,
  `switch_tenant_context`/`reset_tenant_context` vérifiés sur
  `notification_events`, et un test de bout en bout qui appelle la
  **vraie** fonction `app.workers.tasks.purge_expired_idempotency_keys()`
  (pas un helper isolé) sous le rôle restreint : purge effective des clés
  expirées, conservation des clés valides — **18/18 passed**.
- `tests/test_rls_platform_bypass_migration.py` (nouveau, migration
  `20260929_0001`) + `tests/test_rls_current_tenant_uuid_cast_migration.py`
  (migration précédente, non-régression) : **11/11 passed**.
- `tests/test_worker_tasks.py` (préexistant, 23 tests couvrant les jobs
  modifiés) : vérifié qu'aucun test ne patchait
  `app.workers.tasks.SessionLocal` spécifiquement (tous utilisent
  `SessionLocal`/`engine` d'`app.core.database` directement pour leurs
  propres fixtures, toujours valides) — **23/23 passed sans
  modification**.
- Base de référence réelle capturée sur `main`, base PostgreSQL
  **fraîche** (recréée puis `alembic upgrade head`, pas de session
  réutilisée) : **2 échecs préexistants**, reproduits isolément sur
  `main` sans aucun changement de cette PR : (1)
  `test_health.py::test_deep_health_alembic_section_matches_the_running_dialect`
  — un flake dépendant de l'ordre d'exécution de la suite complète,
  passe de façon fiable (3/3) en isolation aussi bien sur `main` que sur
  cette branche ; (2)
  `test_subscription_plans_seed.py::test_all_expected_slugs_present_in_db`
  — dépendance d'ordre préexistante sur les données de seed de
  `subscription_plans`, reproduite identiquement sur `main` en isolation
  et dans la suite complète sur base fraîche, sans lien avec `tenant_id`/
  RLS/le pool de connexions/les workers (`subscription_plans` est une
  table racine, sans `tenant_id` ni politique RLS).
- Suite backend complète sur cette branche, base PostgreSQL fraîche,
  rôle **admin** (comportement actuellement déployé) : **1885 passed, 1
  skipped, 1 failed** (le seul échec restant est le point (2)
  ci-dessus, préexistant) — soit **0 nouvel échec introduit par cette
  PR** par rapport à la base de référence `main`/base fraîche.
- Suite backend complète (SQLite), base fraîche (`test.db` recréé) :
  **1363 passed, 524 skipped, 0 failed** — 0 régression. Une pollution
  inter-exécutions de 19 tests a été observée en réutilisant un
  `test.db` déjà rempli par une exécution précédente ; reproduite à
  l'identique sur `main` avec le même fichier réutilisé — confirmée
  comme une caractéristique préexistante du harnais de tests (le fichier
  SQLite de test n'est pas recréé entre deux lancements manuels
  consécutifs), sans lien avec cette PR.
- `gitleaks detect` (binaire 8.21.2) sur l'arbre de travail complet :
  124 résultats, tous dans des fichiers préexistants et non touchés par
  cette PR (scripts legacy `scripts/test-*.cjs`, un test frontend
  existant) — **0 résultat dans un fichier modifié ou ajouté par cette
  PR**.

### Verdict de la PR précédente (dépassé, voir plus bas pour le verdict actuel)

Au terme de cette PR seule, l'authentification HTTP restait cassée sous
le rôle restreint (`get_current_user()`, point 4) — voir la section
« Authentification RLS-safe sous le rôle restreint » ci-dessus pour la
correction complète, et le verdict à jour juste en dessous.

## Validation de la PR « make authentication RLS-safe under restricted DB role »

- `tests/test_auth_rls_restricted_role.py` (nouveau, 14 tests, rôle
  jetable `NOSUPERUSER NOBYPASSRLS`, `SessionLocal` d'`app.core.database`
  monkeypatché sur ce rôle et exercé à travers le **vrai** `TestClient`
  FastAPI — `POST /auth/login/`, `GET /users/me/`, le WebSocket
  `/realtime/ws/...` — pas une réimplémentation) :
  - Rôle confirmé non-superutilisateur/`NOBYPASSRLS`, DDL refusé
    (`CREATE`/`ALTER`/`DROP TABLE`).
  - **Scénario complet** : `POST /auth/login/` pour un utilisateur
    tenant-scopé réel → `200` avec un token JWT ; `GET /users/me/` avec ce
    token → `200`, tenant correctement résolu (pas `tenant: null`) ; un
    second utilisateur d'un second tenant peut aussi se connecter (pas un
    artefact du premier tenant créé) ; mauvais mot de passe → `401` ;
    email inconnu → `401`.
  - **Isolation inter-tenant** : un `X-Tenant-ID` usurpé vers le tenant B
    n'affecte jamais le contexte d'un utilisateur normal du tenant A
    (`test_token_a_cannot_use_x_tenant_id_header_to_reach_tenant_b`) ;
    `resolve_authenticated_user_row()` ne retrouve jamais l'utilisateur du
    tenant B sous le contexte du tenant A, et vice-versa.
  - **WebSocket** : connexion réussie pour le tenant A avec son propre
    token ; refusée (exception à la connexion, avant tout `accept()`)
    quand ce même token cible l'URL du tenant B.
  - **Non-contamination du pool** : `POST /auth/login/` pour tenant A puis
    tenant B forcés sur la même connexion physique (`StaticPool`) — chaque
    token continue de résoudre son propre tenant après coup, sans fuite
    dans un sens ni dans l'autre.
  - **Cron** : `expire_overdue_subscriptions()` appelée sous le rôle
    restreint expire bien l'abonnement en retard du tenant A sans toucher
    l'abonnement encore actif du tenant B (boucle par tenant avec
    `switch_tenant_context`/`reset_tenant_context`, plus de requête
    globale sur `tenant_subscriptions` qui retournait silencieusement 0
    ligne).
  - **18/18** au total (14 dans cette classe + comptage) — voir le fichier
    pour le détail : **14/14 passed**.
- `tests/test_account_provisioning.py` (préexistant) : un mock de test
  (`SimpleNamespace`) ne portait pas l'attribut `tenant_id` qu'un vrai
  `User` porte toujours ; corrigé dans le test (ajout de `tenant_id=None`
  au mock), pas d'affaiblissement d'assertion — **non-régression
  confirmée**.
- Suites non-régression exécutées explicitement : `tests/
  test_auth_revocation_fail_closed.py` + `tests/
  test_auth_roles_db_source_of_truth.py` (les deux fichiers qui appellent
  `get_current_user()` directement comme coroutine, hors FastAPI —
  **26/26 passed**, confirmant que garder une session indépendante plutôt
  que `Depends(get_db)` était le bon choix) ; `tests/
  test_realtime_websocket_revocation_2026_09_28.py` (protections PR #254
  intactes — **5/5 passed**) ; `tests/test_subscription_expiry.py`
  (**5/5 passed**) ; `tests/test_worker_rls_tenant_context.py` + `tests/
  test_rls_platform_bypass_migration.py` + `tests/
  test_rls_current_tenant_uuid_cast_migration.py` + `tests/
  test_worker_tasks.py` (PR précédente, toujours vertes — **84/84
  passed** en tout, tous fichiers directement liés confondus) ; suite
  élargie `-k "auth or mfa or login or security or password or token"`
  (**413/413 passed, 1 skipped**, base fraîche).
- Suite backend PostgreSQL complète sur cette branche, base **fraîche**
  (recréée, `alembic upgrade head`, rôle admin) : **1899 passed, 1
  skipped, 1 failed** — le seul échec est
  `test_subscription_plans_seed.py::test_all_expected_slugs_present_in_db`,
  le même échec préexistant, sans lien avec `tenant_id`/RLS/l'auth,
  reproduit identiquement sur `main` (voir la PR précédente pour la
  preuve empirique) — **0 nouvel échec introduit par cette PR**.
- Suite backend complète (SQLite), base fraîche (`test.db` recréé) :
  **1363 passed, 538 skipped, 0 failed** — le delta de skips (+14) est
  exactement le nombre de tests de `test_auth_rls_restricted_role.py`,
  marqués `skipif` sur SQLite (RLS est spécifique à PostgreSQL) — 0
  régression.
- `gitleaks detect` (8.21.2) sur l'arbre de travail complet : mêmes 124
  résultats préexistants qu'à la PR précédente, tous dans des fichiers
  que cette PR ne touche pas — **0 résultat dans un fichier modifié ou
  ajouté par cette PR**.

### Verdict final : `schoolflow_app` est-il activable sur Azure DEV ?

**`schoolflow_app` = ACTIVABLE ON AZURE DEV** (environnement de test
encadré, non exposé à des utilisateurs réels — **pas** un feu vert pour
la production ; voir les risques résiduels ci-dessous, qui doivent être
fermés avant toute activation en production).

Cette PR ferme le blocage qui empêchait toute activation
(`get_current_user()` rendant chaque utilisateur tenant-scopé introuvable
à sa propre authentification), plus toute une famille de bugs de la même
nature découverts par l'audit exhaustif qu'il a demandé (login,
rafraîchissement de token, vérification MFA, changement de mot de passe,
réinitialisation forcée, unicité d'email à l'inscription, lien de
réinitialisation de mot de passe, `/users/me/`, authentification
WebSocket, et le cron d'expiration d'abonnements). Le scénario complet
`LOGIN TENANT A → JWT → GET PROTECTED ROUTE → get_current_user → RLS
TENANT A → 200` ainsi que `TOKEN A → TENANT B → DENIED` sont prouvés,
avec la connexion applicative réellement positionnée sur `schoolflow_app`
(`NOSUPERUSER NOBYPASSRLS`), contre un vrai PostgreSQL 16.

**Risques résiduels, identifiés mais explicitement hors périmètre de
cette PR** (à traiter avant une activation en production, pas
nécessairement avant un premier essai encadré sur Azure DEV) :

1. **`/tenants/settings`, `/tenants/security-settings`,
   `/tenants/onboarding/*`, `/storage/upload`** — fichier
   `app/middlewares/tenant.py`, section `public_paths` : ces routes sont,
   comme `/users/me/` (corrigé ici), explicitement exemptées de
   `TenantMiddleware` avec le commentaire "résout son propre tenant, pas
   via le contexte RLS" — mais n'ont pas été individuellement auditées
   pour confirmer qu'elles positionnent réellement leur contexte RLS
   avant toute requête tenant-scopée, comme `/users/me/` ne le faisait
   pas. **Risque** : une requête tenant-scopée sur l'une de ces routes
   pourrait échouer silencieusement (RLS masque la ligne) sous le rôle
   restreint, exactement comme `/users/me/` avant ce correctif.
   **Correction nécessaire** : même audit ligne par ligne que celui fait
   ici sur `/auth/*`, appliqué à chacune de ces routes.
2. **Scripts/CLI hors HTTP non auditès dans cette passe** :
   `app/scripts/seed_saas_plans.py` reste confirmé sans risque (table
   racine `subscription_plans`, sans RLS), mais aucun autre script CLI du
   dépôt n'a été inventorié au-delà de `expire_subscriptions.py`.
3. **(CORRIGÉ, one-shot migrations P0 — `docs/AZURE_ONE_SHOT_MIGRATIONS.md`)**
   `_ensure_mfa_tables()` (`app/api/v1/endpoints/core/mfa.py`) exécutait du
   DDL brut (`CREATE TABLE IF NOT EXISTS`) via la session applicative sur
   14 endpoints. Supprimé entièrement : `mfa_backup_codes`/`email_otps`
   étaient déjà migrées (`20260406_add_mfa_and_perf_indexes.py`) ;
   `mfa_totp_secrets` (seule table sans migration ni modèle ORM) est
   désormais couverte par
   `alembic/versions/20260930_0001_adopt_operational_tables_into_alembic.py`
   et par `app/models/mfa.py` (pour SQLite, qui ne joue jamais Alembic).
   `ensure_operational_tables()` a subi le même traitement dans la même
   passe : `app/main.py` ne l'appelle plus au démarrage (les ~58
   instructions DDL qu'elle contenait sont désormais dans la même
   migration `20260930_0001`, importées telles quelles depuis
   `app.core.operational_tables._DDL` pour garantir zéro dérive) ; le
   module lui-même reste présent car plusieurs tests l'appellent
   directement dans leur propre setup Postgres, indépendamment du
   démarrage applicatif.
4. **Suite de tests contre le rôle restreint** : comme documenté dans la
   PR ARQ workers, la suite backend complète exécutée avec la connexion
   applicative réellement pointée sur `schoolflow_app` continue de
   produire un nombre significatif d'échecs dus aux fixtures de test qui
   contournent `get_db()`/l'API pour créer leurs données directement via
   l'ORM — une limite du harnais de tests, pas un bug de production (voir
   la section « Ne pas encore activer en production » ci-dessus pour le
   détail), toujours non résolue et hors périmètre de cette PR.

Aucun de ces quatre points ne concerne le scénario d'authentification
principal validé par cette PR ; ils représentent des zones non
explicitement vérifiées plutôt que des bugs confirmés (à l'exception du
point 3, confirmé mais sans impact en usage normal). Une activation sur
un environnement Azure **DEV isolé**, pour validation encadrée et non
exposée à des utilisateurs réels, est raisonnable une fois ces quatre
points au moins revus rapidement ; une activation en **production**
demande de les fermer, plus la revue des fixtures de test (point 4) si
l'on souhaite un jour faire tourner la suite de tests elle-même contre le
rôle restreint.
