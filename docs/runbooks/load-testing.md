# Runbook — Tests de charge k6

Scénarios k6 pour l'API FastAPI actuelle, dans `load-tests/`. Ils remplacent
les anciens scripts `badges-*.js` qui ciblaient la stack Supabase supprimée
(les résultats historiques restent dans `docs/reports/PHASE3B_*`).

## Prérequis

- [k6](https://k6.io/docs/get-started/installation/) installé localement.
- Une stack cible démarrée — local Docker (`docker compose up -d`) ou
  environnement de staging. **Jamais la production.**

## Scénarios

### 1. `smoke.js` — santé sous trafic léger (sans authentification)

```bash
k6 run --env BASE_URL=http://localhost:8000 load-tests/smoke.js
```

- 5 utilisateurs virtuels pendant 1 minute sur `/health/ready`,
  `/health/live` et `/`.
- Seuils : p95 < 300 ms, échecs < 1 %.
- Usage : validation rapide après déploiement ou changement d'infra.

### 2. `api-baseline.js` — parcours lecture authentifié

```bash
k6 run \
  --env BASE_URL=http://localhost:8000 \
  --env LOGIN_EMAIL=admin@votre-ecole.gn \
  --env LOGIN_PASSWORD='...' \
  load-tests/api-baseline.js
```

- Un seul login en `setup()` (l'endpoint est limité à 5/minute), token
  partagé entre les VUs.
- Parcours : liste élèves, factures, vue analytics, notifications —
  avec temps de réflexion 1-3 s.
- Profil : montée à 10 VUs, plateau à 25 VUs (école active), pointe à
  50 VUs (rentrée/résultats), descente.
- Seuils : p95 < 500 ms, p99 < 1,5 s, échecs < 1 %, checks > 99 %.

## Objectifs de capacité

| Palier | Cible | Interprétation |
|---|---|---|
| 25 VUs soutenus | p95 < 500 ms | Un établissement actif en journée |
| 50 VUs en pointe | p99 < 1,5 s | Rentrée scolaire, publication des résultats |
| Échecs | < 1 % | Aucune erreur 5xx attendue en lecture |

Si un seuil est dépassé : vérifier d'abord les métriques Prometheus
(`http_request_duration_seconds`, voir [metrics.md](metrics.md)) pour
identifier l'endpoint en cause, puis les requêtes SQL associées.

## Quand exécuter

- Avant toute mise en production d'un changement backend structurel
  (middleware, ORM, migration lourde).
- Avant chaque rentrée scolaire (pic de charge annuel).
- Après un changement de dimensionnement serveur.

Consigner chaque campagne (date, commit, résultats, décisions) dans
`docs/reports/`.
