# Modèle de sécurité — Academy Guinéenne

État réel du modèle de sécurité tel que vérifié dans le code et par tests,
au fil des audits successifs de ce projet. Chaque section renvoie au code
qui l'implémente.

## 1. Authentification

- JWT natif (HS256, `python-jose`/`PyJWT`), pas de fournisseur externe.
  `backend/app/core/security.py`.
- MFA disponible (`backend/app/api/v1/endpoints/core/mfa.py`,
  `mfa_enabled` sur `User`), testé dans `test_mfa_enforcement.py`.
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
  filtrage `WHERE tenant_id = ...` de chaque endpoint, pas sur RLS. Non
  vérifié contre la base de production (accès non disponible depuis cette
  session) : à faire absolument avant mise en production —
  `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '<rôle prod>';`
- Isolation vérifiée par tests dédiés : `test_tenant_isolation.py`, et par
  isolation systématique dans chaque nouveau module ajouté (ex. transcripts,
  teachers, payment receipts — jamais de fuite inter-tenant même avec un
  identifiant deviné, confirmé par des tests explicites "cross-tenant 404").

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
