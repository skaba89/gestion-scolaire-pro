# Statut actuel — source de vérité datée

**Dernière mise à jour : 2026-10-07 (journal de production ci-dessous). Le
tableau « vérifié comme implémenté » a été relu contre le code le 2026-09-14
(`73623a5`) ; seules ses lignes WhatsApp et RLS ont été revérifiées le 2026-10-06.**

Ce document existe parce que plusieurs documents stratégiques du dépôt
(`docs/PROJECT_ANALYSIS.md`, `docs/COMPETITIVE_ANALYSIS_2025.md`) ont pris
un retard important sur le code — voir les bandeaux d'avertissement ajoutés
en tête de ces fichiers. Il ne duplique pas le contenu détaillé des autres
docs : il pointe vers la source qui fait autorité pour chaque sujet, avec
une date de dernière vérification.

**Règle d'entretien** : toute PR qui livre une fonctionnalité listée
« non implémentée » dans un document stratégique existant doit soit
mettre à jour ce fichier, soit ajouter un bandeau d'avertissement au
document concerné (voir le format utilisé dans `PROJECT_ANALYSIS.md` et
`COMPETITIVE_ANALYSIS_2025.md`).

## Ce qui est vérifié comme implémenté (lecture directe du code, 2026-09-14)

| Domaine | État | Preuve dans le code |
|---|---|---|
| Paiement mobile money (Wave, Orange Money, MTN, CinetPay) | ✅ En production | `backend/app/services/payment_gateways.py`, `backend/app/api/v1/endpoints/finance/payments.py` |
| SMS (Android SMS Gateway, Africa's Talking) | ✅ En production | `backend/app/services/notifications.py` |
| Génération de relevés de notes / transcripts | ✅ En production | `backend/app/api/v1/endpoints/academic/transcripts.py` |
| Jobs asynchrones WhatsApp (absence, note, bulletin) | 🟡 Code présent, **worker de production démarré** (2026-10-04, en `schoolflow_worker` depuis le 2026-10-05) ; envoi WhatsApp réel non vérifié en production | `backend/app/workers/tasks.py`, voir le journal 2026-10-06 ci-dessous |
| MFA (TOTP + codes de secours) | ✅ En production | `backend/tests/test_mfa_enforcement.py` |
| Row-Level Security PostgreSQL | ✅ Effective en production (rôles runtime NOBYPASSRLS, 117/117 tables à `tenant_id` en `ENABLE` + `FORCE`, audit lecture seule 2026-10-06) | Journal 2026-10-05 et 2026-10-06 ci-dessous |

## Ce qui reste non vérifié ou non résolu

Ne pas dupliquer ici — se référer directement à ces documents, qui restent
à jour et déjà écrits dans cet esprit :

- **Sécurité** (RLS/superutilisateur en prod, throttling par tenant) :
  `docs/SECURITY_MODEL.md`, section « Risques connus »
- **Scalabilité nationale** (charge testée, monitoring par tenant) :
  `docs/NATIONAL_SCALE_READINESS.md`
- **P0/P1/P2 de mise en production** : `docs/reports/FINAL_PRODUCTION_READINESS_AUDIT.md`
- **Cohérence permissions backend/frontend** : tous les modules listés ici
  auparavant comme "non encore audités" l'ont en fait déjà été (RH,
  messages, bulletins, parents, enseignants, élèves, finance, paiements,
  factures, journaux d'audit, imports/exports) — voir
  `docs/PERMISSIONS_MATRIX.md`, dont la section "Audit institutionnel
  2026-09" couvre chacun avec preuve de code. Cette ligne était elle-même
  périmée par rapport au reste du document qu'elle citait.

- **2026-10-04 — `require_plan` fail-closed** (`backend/app/core/security.py`) :
  tenant introuvable → 403 (`error: TENANT_NOT_FOUND` côté client) ; erreur
  base de données → 503 ; les autres exceptions se propagent (plus d'accès
  accordé par défaut). Tests de régression ajoutés. Points hors périmètre,
  à traiter en tickets séparés : essai sans `trial_ends_at` illimité ;
  `ai.py` sans `require_permission` ; `tenant.is_active` non contrôlé par
  `require_plan` ; `except Exception: pass` dans `security.py` (≈ l. 438-439) ;
  pas de gestion UI du 402 ; `http_exception_handler` (`core/exceptions.py`)
  ignore `exc.headers` (le `Retry-After` des 503 fail-closed de
  `require_plan` / `require_permission` n'atteint pas le client) et ne
  propage que la clé `error_code` d'un detail dict (`PLAN_REQUIRED` et les
  champs `required_plan` / `current_plan` / `upgrade_url` du 402 sont perdus).

- **2026-10-04 — production (App Service + Neon)** : base migrée de
  `20260921_0002` à `20260930_0001` (répétée sur branche Neon, sauvegarde
  `backup-pre-rls-remediation-20261004`) — l'API, en panne depuis au moins le
  2026-10-03 (image `:latest` exigeant ce schéma), a redémarré. Le **worker
  n'a jamais démarré** (journaux depuis le 2026-09-18) : `config.py` refusait
  de s'importer sans `BOOTSTRAP_SECRET`, que le worker n'a pas — corrigé par
  la PR de remédiation runtime (contrôle déplacé dans `app/main.py`, API
  seule). Restent **non résolus** : runtime en `neondb_owner` (BYPASSRLS,
  propriétaire des tables) via le pooler, images App Service en `:latest`
  (code `f464a42`, sans #264–#268), frontend en échec de démarrage, et un
  worker ARQ sur App Service sans port HTTP (sonde de démarrage à vérifier).
  *(Tous résolus depuis : images par digest et worker démarré le 2026-10-04,
  frontend et rôles runtime le 2026-10-05 — voir les entrées ci-dessous.)*

- **2026-10-04 — contexte tenant compatible pooler** (`app/core/database.py`) :
  le contexte RLS était posé une fois par session (`set_config(..., false)`) ;
  derrière un pooler en mode transaction (Neon `-pooler`) il fuyait d'un client
  à l'autre (reproduit sur branche Neon). Il est désormais mémorisé dans
  `Session.info` et reposé en `set_config(..., true)` au début de chaque
  transaction (hook `after_begin`). Tests : `tests/test_rls_tenant_context_pooling.py`.
  DDL runtime retiré (`user_presence`, bootstrap). Procédure du rôle runtime :
  `docs/runbooks/neon-runtime-role.md`.

- **2026-10-04 — durcissement avant bascule runtime** : `/auth/login-diagnostics/`
  (secret par en-tête `X-Bootstrap-Secret` en temps constant, plus aucune
  URL/exception/identifiant dans la réponse) ; `/metrics/` et `/health/deep`
  n'acceptent plus le secret en query string (`Authorization: Bearer` seul —
  adapter tout moniteur qui utilisait `?secret=`) ; jeton WhatsApp comparé en
  temps constant ; présence : anti-IDOR (un admin n'agit que sur son tenant) ;
  contexte RLS toujours posé (`''` par défaut) à chaque transaction ;
  webhooks sortants sous `worker_db_session` ; sonde HTTP optionnelle du worker
  (`WORKER_HEALTH_PORT`, App Service) ; workflow `deploy-appservice.yml`
  (manuel, par digest) ; plan de protection de `main`
  (`docs/runbooks/github-main-protection.md`, non appliqué).

- **2026-10-05 — image frontend App Service** : le frontend de production
  (`academy-guineenne-frontend`) ne démarrait plus — `:latest` venait du
  `Dockerfile` racine (docker-compose), dont nginx proxifie vers le nom d'hôte
  `api:8000`, introuvable sur App Service (nginx s'arrête au démarrage, code 1),
  et écoute sur 80 au lieu de 10000. Nouvelle image dédiée `Dockerfile.appservice`
  (`schoolflow-frontend-appservice`) : statique sans proxy, `0.0.0.0:${PORT}`,
  non-root, URL de l'API fournie au démarrage (`SCHOOLFLOW_API_URL` ou
  `VITE_API_URL`, échec explicite si absente), `/healthz` avec la révision.
  Construite, poussée et testée par digest dans `build-images.yml`
  (`frontend_appservice` du manifeste), vérifiée en PR
  (`frontend-appservice-image.yml`), déployée par `deploy-appservice.yml`.
  En production depuis le 2026-10-05 05:49 UTC (`release-6820abbe…`).

- **2026-10-05 — RLS réellement appliquée en production** : l'API tourne en
  `schoolflow_api` et le worker en `schoolflow_worker` (NOSUPERUSER,
  NOBYPASSRLS, pooler Neon) au lieu de `neondb_owner` (BYPASSRLS). Répété sur
  branche Neon jetable (isolation cross-tenant, pooler), rôles créés puis
  bascules API et worker validées sans rollback. Restent : retrait des
  `POSTGRES_*` de l'API, rotation du mot de passe `neondb_owner`,
  `REVOKE TEMPORARY … FROM PUBLIC`, audit des 15 tables à contournement
  plateforme. Détails : `docs/runbooks/neon-runtime-role.md`.

- **2026-10-06 — audit lecture seule de la production (après la bascule runtime)** :
  API en `schoolflow_api`, worker en `schoolflow_worker` (NOSUPERUSER,
  NOBYPASSRLS, pooler Neon), `neondb_owner` absent des réglages App Service et
  plus aucune variable `POSTGRES_*` côté API ; 117/117 tables à `tenant_id` en
  `ENABLE` + `FORCE ROW LEVEL SECURITY` ; test négatif sous contexte tenant
  étranger : 0 ligne visible ; images épinglées par digest (release `70e2827`).
  Jobs : `purge_old_public_form_submissions` (03:30) et `check_inactive_tenants`
  (04:00) en succès ; **à 03:00 UTC, le worker s'arrêtait chaque nuit** (05/10
  et 06/10) : après `purge_expired_idempotency_keys` (travail en base effectué),
  l'écriture du résultat dans Redis dépassait le délai de connexion par défaut
  d'Arq (1 s, résolution DNS) et l'exception tuait le processus — redémarrage
  ~3 min, job marqué en échec, sans double exécution. Corrigé par #273 (délai
  10 s + relances exponentielles, **worker uniquement** — l'API garde l'échec
  rapide de `enqueue_job`) ; à confirmer sur le run de 03:00 UTC suivant son
  déploiement. Le même jour : ruleset GitHub `protect-main` actif (PR
  obligatoire, 5 checks CI requis en mode strict, historique linéaire,
  suppression et force-push interdits ; 0 approbation — mainteneur unique) et
  suppression des 4 secrets GitHub orphelins du Deployment Center Azure
  (aucun workflow ne les utilisait ; authentification « basic » SCM/FTP déjà
  désactivée sur les trois App Services). Restent, par décision : rotation du
  mot de passe `neondb_owner`, `REVOKE TEMPORARY … FROM PUBLIC` et l'audit des
  15 tables à contournement plateforme.

- **2026-10-07 — nuit de jobs vérifiée (#273 confirmé)** : les trois crons
  (03:00 `purge_expired_idempotency_keys`, 03:30, 04:00 `check_inactive_tenants`)
  en succès, `j_failed=0`, **aucun redémarrage du worker** — le crash nocturne
  Redis est corrigé en production. Aucune erreur permission / RLS / contexte
  tenant / PostgreSQL / Redis entre 02:45 et 05:20 UTC.

- **2026-10-07 — `REVOKE TEMPORARY ON DATABASE neondb FROM PUBLIC`** appliqué
  (vérifié avant COMMIT : `schoolflow_api` / `schoolflow_worker` sans
  TEMPORARY, `neondb_owner` le conserve) ; API et worker sains ensuite.
  Rollback : `GRANT TEMPORARY ON DATABASE neondb TO PUBLIC`.

- **2026-10-07 — régression RLS des routes exemptées du middleware (corrigée)** :
  depuis la bascule runtime du 05/10, les routes que `TenantMiddleware`
  exempte de son contexte JWT tournaient **sans contexte tenant** ; les
  politiques strictes masquaient alors toutes les lignes (constaté en
  production : `/tenants/slug/uls/levels/` renvoyait `[]` pour un tenant à
  5 niveaux). Touchés : pages et statistiques publiques, portail public
  d'admission, scan kiosque, webhooks CinetPay/PayTech (paiement jamais
  trouvé), onboarding, création de tenant, `register-school` (500 RLS),
  statistiques super-admin. Échec fermé (aucune fuite). Corrigé par #277
  (`enter_tenant_context_or_404()` après résolution authentique du tenant ;
  aucune politique modifiée), déployé (release `1498e22`) et vérifié en
  production (5 niveaux, année courante 200). Couvert par
  `tests/test_public_routes_rls_restricted_role.py` (rôle NOBYPASSRLS réel).
  **Même classe, routes SUPER_ADMIN plateforme** (rapprochement des
  abonnements Mobile Money, métriques SaaS, santé d'un tenant — 500,
  impersonation, vérification de domaine) : corrigées par #278,
  couvertes par `tests/test_platform_routes_rls_restricted_role.py`.
  `ministry.py` n'est pas concerné (n'agrège que `tenants`, sans RLS).

- **2026-10-07 — audit des politiques RLS de production** : 117 tables à
  `tenant_id` — 102 strictes, 12 à contournement plateforme sans contexte
  (`NULLIF(...) IS NULL`, migration `20260929_0001`), 3 exposant aussi leurs
  lignes `tenant_id IS NULL` (`jobs`, `notification_preferences`,
  `payment_webhook_events`), et 13 politiques permissives dormantes
  `superadmin_bypass_*` (rien ne pose `app.is_superadmin` — à supprimer).
  Le contexte tenant vient du JWT signé (`X-Tenant-ID` réservé au
  SUPER_ADMIN). Reste : rotation du mot de passe `neondb_owner` (console Neon,
  par l'administrateur) ; suivi P1 — les webhooks de paiement retrouvent la
  référence en parcourant les tenants (coût linéaire par appel non
  authentifié : à remplacer par une recherche à coût constant avant la
  montée en charge).

## Documents à considérer avec prudence

| Document | Problème | À faire avant de le citer |
|---|---|---|
| `docs/PROJECT_ANALYSIS.md` | Décrit une architecture Supabase/Kong abandonnée | Ne pas utiliser — voir le bandeau en tête du fichier |
| `docs/COMPETITIVE_ANALYSIS_2025.md` | 3 gaps « critiques » listés comme non implémentés sont en fait résolus (voir tableau ci-dessus) ; le reste (LMS, timetable auto, biométrie…) n'a pas été re-vérifié | Revérifier les gaps restants avant tout usage commercial ou institutionnel du document |

## Pour une présentation institutionnelle (ministère, partenaire, bailleur)

Avant de citer un chiffre ou une fonctionnalité de ce dépôt devant un tiers
externe, vérifier qu'il provient d'un document **daté après 2026-08** ou de
ce fichier — pas d'un document de 2025 non révisé.
