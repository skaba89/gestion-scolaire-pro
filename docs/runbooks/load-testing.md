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

### 3. `full-journey.js` — parcours complet multi-tenant (Phase 5, pré-commercialisation large)

```bash
k6 run \
  --env BASE_URL=http://localhost:8000 \
  --env TENANTS_FILE=./load-tests/tenants.10.json \
  --env TIER=10 \
  load-tests/full-journey.js
```

- Parcours par itération : dashboard (analytics/élèves/notifications),
  pages publiques (nav + une page, sans authentification), formulaire de
  contact public, imports légers (aperçu CSV, pas de confirmation —
  n'écrit rien en base), paiement (création d'intent, pas de vraie
  charge), webhook WhatsApp simulé (payload façon Meta fait à la main,
  comme `tests/e2e/pilot-journey.spec.ts`), rafale de synchronisation
  hors-ligne simulée (5 check-ins consécutifs sans temps de réflexion,
  pour modéliser un appareil qui vide sa file IndexedDB à la reconnexion).
- `TENANTS_FILE` est **obligatoire** : un JSON `[{slug, email, password}]`
  de tenants déjà provisionnés. Ce script ne crée aucun tenant — la
  création de compte est elle-même limitée en débit et ne devrait jamais
  tourner dans une boucle de charge.
- `TIER` sélectionne le profil de montée en charge :
  - `10` → jusqu'à 25 VUs (quelques écoles actives)
  - `100` → jusqu'à 250 VUs (déploiement régional)
  - `1000` → jusqu'à 1000 VUs (national — répartir sur suffisamment de
    tenants dans `TENANTS_FILE` pour ne pas concentrer la charge)
- Chaque parcours a son propre seuil (`flow_dashboard_ms`,
  `flow_public_pages_ms`, `flow_contact_form_ms`, `flow_imports_ms`,
  `flow_payments_ms`, `flow_whatsapp_webhook_ms`,
  `flow_offline_sync_burst_ms`) — un ralentissement localisé ne se noie
  pas dans la moyenne agrégée `http_req_duration`.

**⚠️ Jamais exécuté contre la production dans cette session** — ce script
a été écrit et sa syntaxe validée (`node --check`), mais k6 lui-même n'est
pas installé dans cet environnement et aucune campagne réelle n'a été
lancée, ni en local ni a fortiori contre
`https://schoolflow-api-r8u7.onrender.com`. Une exécution réelle nécessite
un opérateur humain avec k6 installé, une stack cible (jamais la
production réelle sans autorisation explicite et fenêtre de maintenance),
et un `TENANTS_FILE` provisionné au préalable.

## Métriques à relever pendant une campagne

`http_req_duration`/`http_req_failed` (et les Trends par parcours
ci-dessus) donnent la vue côté client k6. Pour une lecture complète côté
serveur pendant la même fenêtre, croiser avec :

| Métrique | Où la lire | Ce qu'elle indique |
|---|---|---|
| p95 latence par endpoint | Prometheus `http_request_duration_seconds` (voir [metrics.md](metrics.md)) | Isoler l'endpoint en cause si le seuil k6 est dépassé |
| Taux d'erreur 5xx | Logs applicatifs structurés (`app.core.exceptions`) ou Sentry | Distinguer une erreur applicative d'une simple lenteur |
| CPU / RAM | Dashboard Render (par service : api, worker, frontend) | Détecter un service qui sature avant les autres |
| Pool de connexions DB | `DATABASE_POOL_SIZE`/`DATABASE_MAX_OVERFLOW` (app/core/config.py) vs connexions actives Postgres (`SELECT count(*) FROM pg_stat_activity`) | Un pool trop petit se traduit par une latence qui explose sans que la DB elle-même soit en cause |
| File Redis / jobs en attente | `jobs` table (statut `RUNNING` qui s'accumule) ou `redis-cli LLEN` sur la queue Arq | Le worker ne suit plus le rythme d'enqueue |
| Lag du worker Arq | Écart entre `Job.started_at` et l'heure d'enqueue réelle (à instrumenter si absent) | Détecte un worker sous-dimensionné avant que la file ne déborde |

Cette session n'a pas eu accès au dashboard Render ni à un Postgres/Redis
de charge réel — ces mesures doivent être relevées par un opérateur humain
pendant une vraie campagne, pas déduites a priori.

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
