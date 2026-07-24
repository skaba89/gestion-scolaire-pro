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

### Modèle : `Tenant.region`

Colonne texte libre nullable (`backend/app/models/tenant.py`, migration `20260724_0003`) — permet à `MINISTRY_ADMIN` de grouper par région sans construire toute la hiérarchie Pays/Région/Préfecture/Commune/Académie. Volontairement pas un enum ni une table séparée : chaque pays a ses propres régions administratives, et une liste figée bloquerait l'onboarding du premier tenant hors Guinée.

## Pas encore implémenté (différé)

- `NATIONAL_INSPECTOR`, `REGIONAL_DIRECTOR`, `PREFECTURE_ADMIN`, `COMMUNE_ADMIN`, `UNIVERSITY_RECTOR` — aucun de ces rôles n'existe encore en base ni dans `ROLE_PERMISSIONS`. À ajouter un par un, avec le même niveau de rigueur (permission dédiée, endpoint scopé, middleware si nécessaire, tests, mise à jour de ce document) — jamais tous en même temps.
- Hiérarchie complète Pays/Région/Préfecture/Commune/Académie/DPE-DCE comme entités à part entière (tables dédiées, relations) — la colonne `region` actuelle est une étape minimale, pas la structure finale.
- Filtrage `REGIONAL_DIRECTOR` = « voit seulement sa région » — nécessite d'abord un rôle et une association région↔utilisateur, qui n'existent pas encore.

## Découverte importante pendant ce travail

En construisant l'agrégat ministère, j'ai vérifié comment les requêtes cross-tenant traversent (ou pas) la Row-Level Security : **le rôle Postgres utilisé par l'app dans l'environnement Docker local est un superutilisateur** (`rolsuper = true`), ce qui fait que RLS est **entièrement contournée** pour cette connexion, indépendamment de tout contexte de tenant ou des policies `superadmin_bypass_*` (elles-mêmes jamais déclenchées en pratique — `app.is_superadmin` n'est réglé nulle part dans le code applicatif).

**À vérifier directement sur la base de production** (Neon ou autre) :
```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '<utilisateur de connexion prod>';
```
Si ce rôle est également superutilisateur ou possède `rolbypassrls`, l'isolation multi-tenant en production repose uniquement sur le filtrage applicatif (`WHERE tenant_id = ...` dans chaque requête), pas sur RLS — ce qui est probablement le cas vu la rigueur du filtrage applicatif déjà en place, mais mérite une vérification explicite plutôt qu'une supposition. Hors du périmètre de cette session (pas d'accès à la base de production).
