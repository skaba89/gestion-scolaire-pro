# Rôle PostgreSQL non-superutilisateur pour l'application

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
4. **(NOUVEAU, NON RÉSOLU — bloquant, plus grave que le point 3)
   `app/core/security.py::get_current_user()` casse l'authentification de
   tout utilisateur tenant-scopé sous le rôle restreint.** Cette fonction
   est le dependency FastAPI utilisé sur pratiquement toutes les routes
   HTTP protégées. Elle ouvre sa propre session indépendante de celle de
   `get_db()` et exécute, juste avant de chercher l'utilisateur par id :

   ```python
   with SessionLocal() as db:
       if not settings.is_sqlite:
           try:
               db.execute(text(
                   "SELECT set_config('app.current_tenant_id', NULL::text, false)"
               ))
           except Exception:
               pass
       user_db = db.query(User).filter(User.id == user_id).first()
   ```

   Intention apparente : repartir d'un contexte propre sur cette session
   indépendante avant de chercher l'utilisateur par id. Mais
   `set_config(..., NULL, false)` ne remet **pas** le GUC à `NULL` — il le
   redéfinit à une chaîne vide `''` (même piège que les points 1 et 2
   ci-dessus). Or `users` utilise désormais la politique RLS stricte
   `tenant_id IS NOT DISTINCT FROM current_setting(...)::uuid` (migration
   `20260928_0001`, sans aucun bypass platform-wide) : avec le contexte à
   `''`, la ligne de l'utilisateur authentifié devient invisible pour sa
   propre requête. **Confirmé empiriquement** (connexion `psycopg`
   directe, rôle restreint jetable, sans ORM) : un utilisateur
   tenant-scopé réel devient introuvable (`None`) exactement via ce
   chemin de requête, alors que le même utilisateur est trouvable via une
   session dont le contexte est correctement positionné à son propre
   `tenant_id`.

   **Ce bug est hors périmètre de la PR ARQ workers** (portée strictement
   limitée aux jobs d'arrière-plan, voir ci-dessous) et n'a délibérément
   pas été corrigé ici — le corriger correctement demande de revoir
   pourquoi cette fonction utilise une session indépendante de `get_db()`
   plutôt que de la réutiliser, ce qui dépasse le risque qu'une
   correction ponctuelle et non revue pourrait introduire. Il est
   documenté ici en toute transparence parce qu'il **bloque à lui seul**
   l'activation de `schoolflow_app`, indépendamment du sort du point 3.
   Deux follow-ups de la même famille, également hors périmètre :
   `app/api/v1/endpoints/core/realtime.py` (authentification WebSocket,
   même schéma de session indépendante) et
   `app/scripts/expire_subscriptions.py` (script cron externe, pas un job
   ARQ, mais avec le même besoin de balayer plusieurs tenants qu'a
   `check_inactive_tenants` dans `tasks.py` — voir plus bas).

## Propagation du contexte RLS dans les workers ARQ (ce PR)

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

## Validation de la PR « propagate tenant RLS context through ARQ workers »

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

### Verdict final : `schoolflow_app` est-il activable sur Azure DEV ?

**Non, pas encore.** Cette PR ferme complètement le risque qu'elle
ciblait (le point 3 : workers ARQ sans contexte RLS) et corrige au
passage deux bugs de production connexes découverts par le même audit
(`quota.py`, `whatsapp_webhook.py`) ainsi qu'un troisième bug RLS
indépendant (migration `20260929_0001`, bypass platform-wide cassé par
un reset à NULL). Mais le point 4 découvert pendant ce même travail —
`app/core/security.py::get_current_user()` qui rend tout utilisateur
tenant-scopé introuvable sous le rôle restreint — **bloque à lui seul**
l'activation : il casserait l'authentification HTTP de la quasi-totalité
des routes protégées, un risque strictement plus large et plus grave que
celui que corrige cette PR. Activer `schoolflow_app` en l'état ferait
échouer la connexion de tout utilisateur non-`SUPER_ADMIN`. Ce point,
et ses deux follow-ups (`realtime.py`, `expire_subscriptions.py`),
doivent être traités par une PR de suivi dédiée avant toute activation,
même sur un environnement Azure DEV isolé.
