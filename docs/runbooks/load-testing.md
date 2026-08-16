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
- `TENANTS_FILE` est **obligatoire** : un JSON `[{slug, email, password,
  student_id}]` de tenants déjà provisionnés. Ce script ne crée aucun
  tenant — la création de compte est elle-même limitée en débit et ne
  devrait jamais tourner dans une boucle de charge. `load-tests/
  tenants.10.json` et `tenants.50.json` sont des exemples réels
  (identifiants synthétiques locaux, aucun secret).
- `TIER` sélectionne le profil de montée en charge :
  - `10` → jusqu'à 25 VUs (quelques écoles actives)
  - `100` → jusqu'à 250 VUs (déploiement régional)
  - `1000` → jusqu'à 1000 VUs (national — répartir sur suffisamment de
    tenants dans `TENANTS_FILE` pour ne pas concentrer la charge)
- `LOAD_TEST_TOKEN` (optionnel) — voir "Bypass du rate-limit de
  connexion" ci-dessous. Sans elle, `setup()` espace les logins de 13s
  (5/minute/IP), ce qui rend `TIER=100`/`1000` impraticables tels quels.
- Chaque parcours a son propre seuil (`flow_dashboard_ms`,
  `flow_public_pages_ms`, `flow_contact_form_ms`, `flow_imports_ms`,
  `flow_payments_ms`, `flow_whatsapp_webhook_ms`,
  `flow_offline_sync_burst_ms`) — un ralentissement localisé ne se noie
  pas dans la moyenne agrégée `http_req_duration`.

**Exécuté réellement en local à deux reprises** (2026-08-07 et
2026-08-10, `TIER=10`, jamais contre la production) — voir
`docs/reports/LOAD_TEST_CAMPAIGN_2026-08-07.md` pour les résultats
complets et le correctif de contention appliqué entre les deux campagnes.
`TIER=100`/`1000` restent non exécutés : praticables en théorie
maintenant avec `LOAD_TEST_TOKEN`, mais jamais testés à cette échelle
faute d'un environnement dimensionné pour ça (voir la section dédiée
plus bas).

### Bypass du rate-limit de connexion pour une campagne autorisée

`POST /auth/login/` (et les autres routes `@limiter.limit(...)` de
`auth.py` — refresh, logout, change-password, register, register-school,
bootstrap, forgot/reset-password) sont limitées 5/minute par IP contre le
brute-force. Une requête portant l'en-tête `X-Load-Test-Token` égal à la
variable d'environnement serveur `LOAD_TEST_BYPASS_SECRET` en est exemptée
(comparaison à temps constant, `secrets.compare_digest`).

```bash
# Côté serveur (docker-compose, .env.docker, ou variable Render) :
LOAD_TEST_BYPASS_SECRET=un-secret-genere-pour-cette-campagne-uniquement
# Obligatoire depuis l'audit round 2 (finding Low) : une expiration ISO 8601,
# dans le futur — sans elle (ou une fois dépassée), le bypass est traité
# comme inerte automatiquement, plutôt que de dépendre uniquement de la
# discipline de l'opérateur pour la retirer à temps.
LOAD_TEST_BYPASS_EXPIRES_AT=2026-08-20T00:00:00Z

# Côté k6 :
k6 run --env LOAD_TEST_TOKEN=un-secret-genere-pour-cette-campagne-uniquement ...
```

**Règles d'usage** :
- Vide par défaut — totalement inerte tant qu'un opérateur ne configure
  pas explicitement **les deux** variables (le secret seul ne suffit plus
  à activer le bypass).
- Générer un secret dédié à chaque campagne, jamais le même deux fois.
- Choisir `LOAD_TEST_BYPASS_EXPIRES_AT` juste au-delà de la fenêtre de
  campagne prévue (quelques heures, jamais plusieurs jours) — c'est le
  filet de sécurité automatique si le retrait manuel est oublié.
- **Ne jamais laisser configuré au-delà de la fenêtre de campagne** —
  retirer les deux variables d'environnement dès la fin du test, même si
  l'expiration doit de toute façon rendre le bypass inerte peu après.
- Ne jamais configurer sur l'environnement de production réel connecté à
  de vrais utilisateurs, même temporairement — réservé aux environnements
  de staging/charge dédiés.

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

## Exigences pour un test à 10 000 utilisateurs simultanés

Demandé explicitement dans la feuille de route national/international —
posé ici en clair plutôt que tenté sur un environnement qui ne peut pas le
supporter de façon représentative.

### Pourquoi pas sur ce poste de développement

La campagne du 2026-08-07 a déjà montré une dégradation sévère à
seulement **25 VUs** sur ce poste (conteneurs Postgres/Redis à
512 Mo/128 Mo, CPU partagé avec d'autres charges, parfois un autre
projet entier tournant en parallèle sur la même machine — rencontré
concrètement pendant cette session). Pousser à 10 000 VUs dessus ne
mesurerait que la limite du poste, pas celle de l'application — et
risquerait de rendre le poste inutilisable pour le reste du travail en
cours.

### Ce qu'il faut réellement provisionner

| Composant | Dimensionnement indicatif | Pourquoi |
|---|---|---|
| API | Plusieurs instances Render (ou VPS/K8s équivalent) derrière un load balancer, `WORKERS` ajusté par instance | Un seul processus (voir campagne dev-mode) ou même 4 workers sur une instance ne suffisent pas à 10k connexions concurrentes |
| PostgreSQL | Plan managé avec une vraie limite de connexions connue (ex. Render Postgres Pro/Enterprise), `DATABASE_POOL_SIZE`/`MAX_OVERFLOW` recalculés selon `(pool+overflow) × workers × instances ≤ limite du plan` | Le défaut actuel (5+10/worker) est dimensionné pour un déploiement modeste — voir le commentaire dans `app/core/config.py` |
| Redis | Instance dédiée (pas partagée avec d'autres services), monitorée en throughput de commandes | File Arq + cache + rate-limit + sessions actives, tous sur la même instance aujourd'hui |
| Réseau de test | Plusieurs adresses IP sources pour le trafic k6 (ex. plusieurs instances k6 dans des régions différentes), même avec `LOAD_TEST_TOKEN` — un seul point d'origine reste un goulot réseau/OS à cette échelle | 10 000 connexions HTTP simultanées depuis une seule machine sature les descripteurs de fichiers et la pile réseau du client avant même d'atteindre le serveur |
| `TENANTS_FILE` | Au minimum quelques centaines de tenants distincts, pas 10-50 | Concentrer 10 000 VUs sur 10 tenants ferait porter toute la charge sur 10 lignes `RLS`/pools de connexion, pas un scénario réaliste de 10 000 écoles distinctes |
| Observabilité | Dashboard Grafana/Superset branché sur les métriques Prometheus déjà exposées, `pg_stat_activity` accessible en direct pendant le run | Sans ça, un run à 10k ne fait que confirmer "ça a mal tourné" sans dire pourquoi — voir la limite déjà rencontrée sur la campagne du 07/08 |

### Ce qui est déjà prêt côté application

- Le script `full-journey.js` supporte déjà `TIER=1000` (jusqu'à 1000 VUs)
  et peut être étendu à un palier `10000` par simple ajout d'un profil de
  stages — aucun changement d'architecture du script nécessaire.
- Le bypass de rate-limit de connexion (`LOAD_TEST_TOKEN`) rend le
  provisioning de centaines/milliers de connexions de test praticable.
- Les quotas par tenant (`QuotaMiddleware`) empêchent déjà qu'un tenant
  synthétique n'affame les autres pendant le test.

### Prochaine étape concrète

Provisionner un environnement de staging dimensionné comme ci-dessus est
une décision d'infrastructure et de budget qui appartient à l'opérateur
avec accès au compte Render/cloud — pas quelque chose qu'un agent IA sans
accès à ce compte peut créer depuis cet environnement de développement.
