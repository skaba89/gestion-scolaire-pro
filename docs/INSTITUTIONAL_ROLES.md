# Rôles institutionnels — national audit Phase 2

Le prompt d'audit national prévoit une hiérarchie complète de rôles institutionnels (`SUPER_ADMIN_PLATFORM`, `MINISTRY_ADMIN`, `NATIONAL_INSPECTOR`, `REGIONAL_DIRECTOR`, `PREFECTURE_ADMIN`, `COMMUNE_ADMIN`, `UNIVERSITY_RECTOR`...) avec sa propre règle : **« ne pas refondre tout le RBAC en une seule fois, ajouter progressivement »**. Ce document reflète ce qui est **réellement implémenté**, pas la cible finale — à mettre à jour à chaque rôle ajouté.

## Implémenté

### `MINISTRY_ADMIN`

| | |
|---|---|
| **Portée** | Plateforme (`tenant_id = NULL` sur la ligne `user_roles`, comme `SUPER_ADMIN`) |
| **Permissions backend** | `ministry:read` uniquement (`backend/app/core/security.py`, `ROLE_PERMISSIONS`) |
| **Endpoint** | `GET /api/v1/ministry/overview/` (`backend/app/api/v1/endpoints/core/ministry.py`) — compteurs agrégés uniquement (total établissements, actifs/inactifs, par région, par type). **Ne retourne jamais** le nom, l'email, ou toute donnée d'un établissement individuel, ni aucune donnée élève/finance. |
| **Middleware tenant** | Exempté de l'obligation `tenant_id` dans le JWT (`backend/app/middlewares/tenant.py`), au même titre que `SUPER_ADMIN` — mais sans le mécanisme de ciblage cross-tenant via `X-Tenant-ID` (il n'a jamais besoin de cibler un tenant précis). |
| **Frontend** | Type `MINISTRY_ADMIN` ajouté à `AppRole` (`src/lib/types.ts`). **Pas de page dédiée** — différé à la Phase 7 (module ministère complet : dashboard, exports, cartes régionales...). |
| **Tests** | `backend/tests/test_ministry.py` — accès accordé (MINISTRY_ADMIN, SUPER_ADMIN), refusé (TENANT_ADMIN, TEACHER, non-authentifié), forme de la réponse (uniquement des compteurs, jamais de donnée nominative). |

### `REGIONAL_DIRECTOR` / `PREFECTURE_ADMIN` / `COMMUNE_ADMIN`

**Correction (2026-09)** : ce document affirmait plus bas que ces trois rôles
« n'existent pas encore » — faux, ils sont bien implémentés (Phase 5/7 de
l'audit national) ; l'affirmation obsolète a directement causé un vrai
trou de sécurité (voir plus bas) en laissant croire qu'ils étaient hors
du périmètre du renforcement MFA fait pour `MINISTRY_ADMIN`.

| | |
|---|---|
| **Portée** | Institutionnelle, scopée à leur propre tenant/établissement — PAS plateforme (contrairement à `MINISTRY_ADMIN`/`SUPER_ADMIN`, qui ont `tenant_id = NULL`). Chacun voit uniquement les établissements partageant sa propre `region`/`prefecture`/`commune` (colonnes `Tenant`), narrowing le plus étroit d'abord (`COMMUNE_ADMIN` > `PREFECTURE_ADMIN` > `REGIONAL_DIRECTOR`, voir `_SCOPE_ROLES` dans `ministry.py`). |
| **Permissions backend** | `ministry:read` uniquement, comme `MINISTRY_ADMIN` (`backend/app/core/security.py`, `ROLE_PERMISSIONS`). |
| **Endpoint** | Mêmes endpoints que `MINISTRY_ADMIN` (`GET /ministry/overview/`, `GET /ministry/overview/export/`) — le narrowing par scope est appliqué dans `_institutional_scope()`/`_compute_overview()` (`ministry.py`), avec une règle explicite : si le champ de scope du tenant appelant est vide (région/préfecture/commune non renseignée), le rôle ne voit AUCUN établissement plutôt que de tomber sur "tout voir" par défaut. |
| **Révocation de token** | Inclus dans `PRIVILEGED_ROLES` (`app/core/security.py`) — refus 503 (fail-closed) si Redis/blacklist est injoignable, plutôt qu'un fail-open silencieux. |
| **MFA** | **Corrigé le même jour que cette note** — ces trois rôles étaient absents de `PRIVILEGED_ROLES_REQUIRING_MFA` (`app/api/v1/endpoints/core/auth.py`) à cause de cette doc obsolète les déclarant inexistants. Ajoutés (voir `test_mfa_enforcement.py`). |
| **Tests** | `backend/tests/test_ministry.py` couvre le narrowing par scope et le cas "scope vide → aucun établissement visible". |

### `NATIONAL_INSPECTOR`

| | |
|---|---|
| **Portée** | Plateforme (`tenant_id = NULL` sur la ligne `user_roles`), même forme que `MINISTRY_ADMIN`. |
| **Permissions backend** | `ministry:read` uniquement (`backend/app/core/security.py`, `ROLE_PERMISSIONS`) — même permission que `MINISTRY_ADMIN`, distinction d'intention (audit/inspection plutôt qu'administration) sans distinction d'accès à ce stade. |
| **Endpoint** | Mêmes endpoints que `MINISTRY_ADMIN` (`GET /ministry/overview/`, `GET /ministry/overview/export/`) — visibilité nationale complète, jamais narrowé (`_institutional_scope()` dans `ministry.py` le traite comme platform-level, au même titre que `SUPER_ADMIN`/`MINISTRY_ADMIN`). |
| **Middleware tenant** | Exempté de l'obligation `tenant_id` dans le JWT (`backend/app/middlewares/tenant.py`), même bypass que `MINISTRY_ADMIN`. |
| **Révocation de token** | Inclus dans `PRIVILEGED_ROLES` (`app/core/security.py`) — refus 503 (fail-closed) si Redis/blacklist est injoignable. |
| **MFA** | Ajouté à `PRIVILEGED_ROLES_REQUIRING_MFA` (`app/api/v1/endpoints/core/auth.py`) **dans le même changement** qui introduit le rôle — pas en correctif après coup, précisément pour éviter de répéter le trou laissé par la doc obsolète pour `MINISTRY_ADMIN`/`REGIONAL_DIRECTOR`/`PREFECTURE_ADMIN`/`COMMUNE_ADMIN` ci-dessus. |
| **Frontend** | Type `NATIONAL_INSPECTOR` ajouté à `AppRole` (`src/lib/types.ts`). Pas de page dédiée. |
| **Tests** | `backend/tests/test_ministry.py` (accès accordé, visibilité nationale non narrowée) et `backend/tests/test_mfa_enforcement.py`/`test_auth_revocation_fail_closed.py` (MFA obligatoire, fail-closed sur panne Redis). |

### Modèle : `Tenant.region` / `Tenant.prefecture` / `Tenant.commune`

Colonnes texte libre nullables (`backend/app/models/tenant.py`, migrations `20260724_0003` et `20260727_0001`) — permettent le groupement/narrowing sans construire toute la hiérarchie Pays/Région/Préfecture/Commune/Académie. Volontairement pas un enum ni une table séparée : chaque pays a ses propres régions administratives, et une liste figée bloquerait l'onboarding du premier tenant hors Guinée.

## Pas encore implémenté (différé)

- `UNIVERSITY_RECTOR` — n'existe pas encore en base ni dans `ROLE_PERMISSIONS`. À ajouter avec le même niveau de rigueur que `NATIONAL_INSPECTOR` ci-dessus (permission dédiée, endpoint scopé, middleware si nécessaire, tests, MFA si le rôle est institutionnel/privilégié, mise à jour de ce document) — jamais tous en même temps. **Leçon de la correction plus haut : la mise à jour de ce document au moment même où le rôle est ajouté au code n'est pas optionnelle — un rôle "oublié" ici a directement empêché son inclusion dans le renforcement MFA fait pour un rôle voisin.**
- Hiérarchie complète Pays/Région/Préfecture/Commune/Académie/DPE-DCE comme entités à part entière (tables dédiées, relations) — les colonnes texte libre actuelles sont une étape minimale, pas la structure finale.

## Découverte importante pendant ce travail

En construisant l'agrégat ministère, j'ai vérifié comment les requêtes cross-tenant traversent (ou pas) la Row-Level Security : **le rôle Postgres utilisé par l'app dans l'environnement Docker local est un superutilisateur** (`rolsuper = true`), ce qui fait que RLS est **entièrement contournée** pour cette connexion, indépendamment de tout contexte de tenant ou des policies `superadmin_bypass_*` (elles-mêmes jamais déclenchées en pratique — `app.is_superadmin` n'est réglé nulle part dans le code applicatif).

**À vérifier directement sur la base de production** (Neon ou autre) :
```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '<utilisateur de connexion prod>';
```
Si ce rôle est également superutilisateur ou possède `rolbypassrls`, l'isolation multi-tenant en production repose uniquement sur le filtrage applicatif (`WHERE tenant_id = ...` dans chaque requête), pas sur RLS — ce qui est probablement le cas vu la rigueur du filtrage applicatif déjà en place, mais mérite une vérification explicite plutôt qu'une supposition. Hors du périmètre de cette session (pas d'accès à la base de production).
