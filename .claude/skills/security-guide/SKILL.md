---
name: security-guide
description: Modèle de sécurité Academy Guinéenne et checklist de revue — authentification JWT/MFA/révocation, isolation tenant, IDOR, injection SQL, XSS, SSRF, uploads, rate limiting, secrets, données personnelles (mineurs). À utiliser pour toute revue sécurité, tout changement touchant auth/données sensibles, et l'étape SECURITY REVIEW.
---

# Sécurité

Source de vérité : `docs/SECURITY_MODEL.md` (auth, RLS, MFA, révocation),
`docs/POSTGRES_APP_ROLE.md`. Ne pas dupliquer : lire la section concernée.

## Surfaces critiques du dépôt

| Zone | Fichiers |
|---|---|
| Auth, tokens, révocation, RBAC | `backend/app/core/security.py`, `endpoints/core/auth.py`, `endpoints/core/mfa.py` |
| Contexte tenant / RLS | `core/database.py`, `core/tenant_resolution.py`, `middlewares/tenant.py` |
| IP client / rate limit | `core/client_ip.py`, limiters slowapi par module |
| SSRF (webhooks, PDF) | `core/ssrf_protection.py` |
| Uploads | `endpoints/core/storage.py` (magic bytes), `core/storage.py` |
| HTML tenant (pages publiques) | `src/lib/sanitize.ts`, `src/pages/public/` |
| Token côté client | `src/api/client.ts`, `src/contexts/AuthContext.tsx` |

## Checklist SECURITY REVIEW (sur le diff)

**Contrôle d'accès**
- [ ] Chaque route modifiée a `require_permission` adéquat (ou contrôle d'appartenance justifié)
- [ ] Tenant résolu via `resolve_current_tenant_id` ; filtre `tenant_id` sur chaque requête
- [ ] FK fournies par le client vérifiées dans le tenant (IDOR) ; ids séquentiels non exposés
- [ ] Rôles personnels (PARENT/STUDENT/TEACHER) limités à leur périmètre
- [ ] Alias éventuel dans `aliases.py` protégé à l'identique

**Injection & entrées**
- [ ] SQL paramétré ; aucun `text(f"...")` avec donnée utilisateur
- [ ] Validation Pydantic ; tailles/longueurs bornées ; pagination bornée
- [ ] Pas d'`eval`/`exec`/`pickle`/`shell=True`
- [ ] URL sortante → `ssrf_protection` ; upload → vérification du type réel + taille
- [ ] HTML → `sanitizeHtml` ; liens tenant sans `javascript:`

**Auth & sessions**
- [ ] Pas d'affaiblissement de la vérification JWT (`iss`, `aud`, `exp`, algorithme)
- [ ] Révocation (`token_version`, jti) respectée ; fail-closed conservé pour les privilégiés
- [ ] Nouveau rôle privilégié → `PRIVILEGED_ROLES` (MFA) ; opération sensible → `SENSITIVE_PERMISSIONS`
- [ ] Rate limit sur toute route publique ou d'authentification

**Données & secrets**
- [ ] Aucun secret, token, mot de passe, connection string dans le code, les tests, les logs, la doc
- [ ] Pas de PII (élèves mineurs, téléphones parents) dans les logs, Sentry ou messages d'erreur
- [ ] RGPD : suppression/anonymisation couvre les nouvelles colonnes personnelles (`endpoints/core/rgpd.py`)
- [ ] Erreurs client génériques (pas de trace, pas de SQL)

**Fail-open interdit**
- [ ] Aucun nouveau chemin qui accorde l'accès en cas d'exception (`require_plan` est désormais fail-closed : 403 / 503)

## Classement des constats

`Critique` (exploitable, fuite inter-tenant, élévation de privilège) · `Haute` ·
`Moyenne` · `Basse` · `Info`. Pour chaque constat : `fichier:ligne`, scénario
d'exploitation concret, correction proposée, test de régression attendu.
Ne rapporter que ce qui est vérifié dans le code ; marquer « à confirmer » sinon.

## Secrets détectés

Si un secret réel apparaît (fichier, log, historique) : ne pas le recopier dans la
réponse, indiquer l'emplacement, recommander rotation + purge. La CI exécute gitleaks.
