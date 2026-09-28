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

## Risques connus (non résolus, hors périmètre de cette session)

- **P1** : vérifier le rôle PostgreSQL de production n'est pas
  superutilisateur (sinon RLS est un théâtre de sécurité en prod aussi).
- **P2** : monitoring non ventilé par tenant — un tenant compromis ou
  abusif n'est pas isolable finement à ce jour.
- **P2** : pas de throttling par tenant (seulement par IP) — un tenant à
  fort trafic peut consommer les ressources des autres sur une
  infrastructure mutualisée.
