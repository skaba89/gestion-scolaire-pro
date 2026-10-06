---
name: architecture-guide
description: Architecture d'Academy Guinéenne (frontend React par portail, backend FastAPI en couches, multi-tenant RLS, workers ARQ). À utiliser pour analyser un changement transverse, produire un plan d'impact, vérifier la cohérence architecturale (étape ARCHITECTURE CHECK) ou décider où placer du nouveau code.
---

# Architecture — guide de décision

Sources de vérité : `docs/STATUT_ACTUEL.md` (état réel daté), `docs/SECURITY_MODEL.md`,
`docs/STORAGE_ARCHITECTURE.md`, `docs/ASYNC_JOBS_GUIDE.md`, `docs/IMMUTABLE_RELEASES.md`.
Le code fait foi si un document diverge — signaler la divergence.

## Vue d'ensemble

```
Navigateur / Capacitor ──► SPA React (portails lazy par rôle, /:tenantSlug/...)
        │  apiClient (JWT Bearer)
        ▼
FastAPI ── middlewares (CORS, RequestID, SlowAPI, Quota, Tenant, token_version, security headers, Metrics — ordre réel : app/main.py)
   │  endpoints/{core,academic,finance,operational} → crud/ | services/
   │  get_db() pose app.current_tenant_id (RLS PostgreSQL)
   ├── PostgreSQL 16 (RLS, rôle applicatif non superuser en prod)
   ├── Redis (cache, révocation tokens, rate limit, file ARQ)
   ├── Worker ARQ (worker_db_session(tenant_id), fail-closed)
   └── Stockage objet (abstraction core/storage.py)
Migrations : job one-shot séparé, AVANT le déploiement de l'API (jamais au démarrage).
```

## Où placer le code

| Besoin | Emplacement |
|---|---|
| Route HTTP | `backend/app/api/v1/endpoints/<domaine>/<fichier>.py` (pas `aliases.py`) |
| Accès données réutilisable | `backend/app/crud/` |
| Règle métier multi-entités, intégration externe | `backend/app/services/` |
| Traitement long / différé | tâche ARQ `app/workers/tasks.py` + `enqueue_job` |
| Événement de domaine | `app/core/events.py` |
| Schéma requête/réponse | `backend/app/schemas/` |
| Page | `src/pages/<portail>/` + route lazy dans `src/routes/` |
| Hook données | `src/queries/<domaine>.ts` |
| Composant réutilisable | `src/components/<domaine>/` (UI de base : `components/ui/`) |

## Dette connue — ne pas aggraver

- Fichiers géants (`school_life.py`, `tenants.py`, `auth.py`, `parents.py`,
  `aliases.py`, `PublicPageView.tsx`) : ne pas y ajouter de nouveau domaine ;
  extraire plutôt que grossir, mais seulement dans un changement dédié.
- `aliases.py` duplique des routes : toute correction de permission doit être
  appliquée à la route canonique **et** à son alias.
- `core/operational_tables.py` : importé par une migration historique — gelé.
- Matrices RBAC dupliquées front/back.
- Cibles de déploiement héritées (Render/Netlify) à côté de la cible principale.

## Checklist ARCHITECTURE CHECK

1. Le changement respecte-t-il les couches (pas de SQL métier lourd dans le router si un crud/service existe) ?
2. Isolation tenant assurée à deux niveaux (filtre applicatif + RLS) ?
3. Contrat API : rupture pour le frontend, l'app mobile, ou un alias existant ?
4. Impact schéma → migration + compatibilité avec la version N-1 de l'API pendant le déploiement ?
5. Synchrone ou job ARQ (durée > ~2 s, appel externe, envoi en masse) ?
6. Nouvelle dépendance justifiée ? Spécifique à un cloud → derrière une abstraction ?
7. Observabilité : logs structurés, métrique, erreurs remontées (Sentry) ?
8. Rollback possible sans perte de données ?

Sortie attendue : `OK` / `OK avec réserves` / `BLOQUANT`, avec justification par point.
