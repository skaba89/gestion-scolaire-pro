---
name: performance-guide
description: Performance Academy Guinéenne — requêtes SQLAlchemy (N+1, index, pagination), pool de connexions, cache Redis, jobs ARQ, bundle Vite et React Query, réseau lent, tests de charge k6. À utiliser pour analyser ou optimiser une lenteur, ou relire l'impact performance d'un changement.
---

# Performance

Références : `docs/LOAD_TEST_PLAN.md`, `docs/LOAD_TEST_RESULTS.md`,
`docs/runbooks/load-testing.md`, scripts `load-tests/` (k6).

## Principe

Mesurer avant d'optimiser. Toute affirmation de gain s'appuie sur une mesure
(temps de requête, nombre de requêtes SQL, taille de bundle, résultat k6) avant/après.

## Backend

- **N+1** : boucle qui déclenche une requête par élément → `selectinload`/`joinedload`
  ou requête groupée (`IN`). Les sessions sont synchrones : chaque requête bloque un worker.
- **Pagination bornée** sur toute liste ; pas de `.all()` sur des tables volumineuses
  (élèves, notes, présences, paiements, messages, audit_logs).
- **Index** : tout nouveau filtre/tri fréquent, surtout composé avec `tenant_id`.
  Vérifier avec `EXPLAIN ANALYZE` sur la stack locale PostgreSQL.
- **Pool DB** : `DATABASE_POOL_SIZE` / `DATABASE_MAX_OVERFLOW` (`core/config.py`) ;
  ne pas ouvrir de session hors `get_db` / helpers (fuite de connexions).
- **Cache Redis** (`core/cache.py`) : données de référence peu volatiles ; clé
  toujours préfixée par le tenant ; invalidation explicite à l'écriture.
- **Travail long** (PDF, imports, envois WhatsApp/email en masse) → job ARQ.
- **Exports/rapports** : streaming ou job, jamais tout en mémoire pour un gros tenant.

## Frontend

- Routes lazy par portail : ne pas importer statiquement une page lourde.
- Bibliothèques lourdes (jspdf, docx, recharts, html5-qrcode) : import dynamique au moment de l'usage.
- Listes longues : `@tanstack/react-virtual`.
- React Query : `staleTime` adapté, pas de refetch en boucle, pas de requêtes en cascade évitables.
- Réseau lent : réponses paginées, images optimisées, pas de polling agressif.
- Mesure bundle : `npm run build` (rapport du visualizer si configuré dans `vite.config.ts`).

## Revue performance — sortie

Tableau `constat | fichier:ligne | impact estimé (volumétrie) | mesure/preuve | correction | priorité`.
Distinguer « mesuré » de « supposé ».
