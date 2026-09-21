# Campagne de tests de performance — pré-déploiement multi-établissement → national (2026-09)

> **Statut des résultats aux paliers 250/500/1000/2500 VU : toujours NON
> VÉRIFIÉ** — voir §11 pour ce qui a changé depuis la version précédente
> de cette note. Ce document livre l'**outillage reproductible** (scripts
> k6, capture d'infra, injection de pannes, synthèse) et la **méthode**.
> Les chiffres de charge (RPS, p95, point de saturation) à ces paliers
> doivent être produits en exécutant la campagne sur un environnement
> **dimensionné comme la production** — pas sur un poste de dev (les
> mesures y seraient bornées par la machine, pas par l'application).

## 1. Objectif
Mesurer objectivement la capacité de la plateforme et **identifier le
premier point de saturation réel** (pas obtenir un run vert), avant
déploiement multi-établissement puis national. **Aucun changement
d'architecture** tant que les mesures ne le justifient.

## 2. Périmètre & existant
Construit **au-dessus** de l'outillage existant (`load-tests/smoke.js`,
`api-baseline.js`, `full-journey.js`, `docs/runbooks/load-testing.md`,
`docs/LOAD_TEST_PLAN.md`). Ajouts de cette campagne :

| Fichier | Rôle |
|---|---|
| `load-tests/lib/scenarios.js` | flux métier partagés (endpoints réels) + Trends par flux |
| `load-tests/campaign.js` | échelle **250 / 500 / 1000 / 2500 VU**, mix métier, sonde login, SLO explicites |
| `load-tests/saturation.js` | **ramping-arrival-rate** (modèle ouvert) pour trouver le genou de débit |
| `load-tests/resilience.js` | dégradation/récupération, **retry/idempotence**, resync offline massif |
| `load-tests/capture-infra-metrics.sh` | échantillonne PG, pool, Redis, Arq, CPU/mém, MinIO |
| `load-tests/run-campaign.sh` | orchestre l'échelle + capture + synthèse |
| `load-tests/summarize.py` | tableaux + verdict « premier point de saturation » |
| `load-tests/chaos/` | injection de pannes + runner résilience |

## 3. Scénarios métier (tous couverts)
login · consultation tableau de bord · consultation élèves · **saisie des
présences** · **saisie de notes** · consultation résultats · paiements
(lecture facturation) · notifications · synchronisation offline ·
**resynchronisation après reconnexion** (rafale). Endpoints réels vérifiés
contre `backend/app/api/v1/endpoints` et `app/schemas`.

## 4. Seuils de succès explicites (SLO)
Un palier qui **dépasse** l'un de ces seuils marque un point de saturation.

| Métrique | Seuil |
|---|---|
| Taux d'erreur (`http_req_failed`) | < 1 % |
| Latence globale p95 | < 800 ms |
| Latence globale p99 | < 2000 ms |
| Timeouts (`request_timeouts`) | 0 |
| Checks | > 99 % |
| login p95 | < 1000 ms |
| lectures (dashboard/élèves/résultats/paiements/notifs) p95 | < 600–800 ms |
| écritures (présences/notes) p95 | < 1000 ms |
| rafale resync offline p95 | < 2500 ms |
| **Résilience** : `idempotent_replay_DIVERGENT` | **= 0** (invariant) |
| **Résilience** : 5xx soutenus sous panne | interdits (429/503 contrôlés OK) |

## 5. Mesures obligatoires (comment elles sont capturées)
| Mesure | Source |
|---|---|
| requêtes/s, p50/p95/p99, taux d'erreur, timeouts | k6 (`summary-export`, `request_timeouts`) |
| PostgreSQL (connexions / max), **saturation du pool** | `capture-infra-metrics.sh` → `pg_stat_activity`, `/health/ready` (pool `checked_out/capacity/ratio/status`) |
| Redis (clients, ops/s, mémoire) | `redis-cli INFO` |
| workers / jobs | `ZCARD arq:queue` (file Arq en attente) |
| CPU / mémoire (api, worker, pg, redis, minio) | `docker stats` |
| stockage objet | conteneur MinIO (`docker stats`) + santé |
| compteurs applicatifs | scrape `GET /metrics` (Prometheus, conservé brut) |

## 6. Exécution
Prérequis : `k6` en PATH, stack cible démarrée, `TENANTS_FILE` provisionné
(voir `load-tests/seed-load-test-tenants.md`), **cible ≠ production**.

```bash
# Échelle complète 250→500→1000→2500 + capture infra + synthèse
BASE_URL=https://staging.example \
TENANTS_FILE=./load-tests/tenants.100.json \
LOAD_TEST_TOKEN=<= LOAD_TEST_BYPASS_SECRET de la cible> \
WRITE_SCENARIOS=1 \
TIERS="250 500 1000 2500" \
./load-tests/run-campaign.sh
# → results/campaign-<stamp>/SYNTHESIS.md (tableaux + verdict)

# Genou de débit (modèle ouvert)
BASE_URL=... TENANTS_FILE=... LOAD_TEST_TOKEN=... \
START_RPS=50 MAX_RPS=2000 STEP_DURATION=1m \
k6 run --summary-export=results/saturation-summary.json load-tests/saturation.js

# Résilience (baseline → panne → récupération, par panne)
BASE_URL=... TENANTS_FILE=./load-tests/tenants.10.json LOAD_TEST_TOKEN=... \
FAULTS="redis_down redis_slow worker_stopped postgres_saturated storage_down network_timeout" \
./load-tests/chaos/run-resilience.sh
```

## 7. Résultats — À REMPLIR après exécution (NON VÉRIFIÉ)
`summarize.py` génère automatiquement ces tableaux dans `SYNTHESIS.md` :

### 7.1 Requêtes par palier
| Tier (VU) | RPS | p50 | p95 | p99 | Err % | Timeouts | Checks % | SLO |
|---|---|---|---|---|---|---|---|---|
| 250 | _à remplir_ | | | | | | | |
| 500 | | | | | | | | |
| 1000 | | | | | | | | |
| 2500 | | | | | | | | |

### 7.2 Infra (pics) par palier
| Tier | Pool ratio | Pool exhausted | PG conn/max | Redis ops/s | Redis clients | Arq pending | API CPU % |
|---|---|---|---|---|---|---|---|
| 250 | | | | | | | |
| … | | | | | | | |

### 7.3 Résilience par panne
| Panne | Err % pendant | p95 pendant | 5xx soutenus ? | idempotence divergente | Récupération auto |
|---|---|---|---|---|---|
| redis_down | | | | 0 attendu | |
| worker_stopped | | | | | |
| postgres_saturated | | | | | |
| storage_down | | | | | |
| redis_slow | | | | | |
| network_timeout | | | | | |

## 8. Méthode d'identification du goulot
Le **premier palier** qui dépasse un SLO = premier point de saturation.
Corréler avec la capture infra au même instant :
- `pool_status=exhausted` / `pool_ratio≈1` → **pool de connexions** app.
- `pg_conn_total≈max_connections` → **max_connections PostgreSQL**.
- `api_cpu≈100%` → **CPU API** (scaler les réplicas / profiler).
- `redis_ops` très élevé → motif de clés cache/rate-limit.
- Aucun pic infra mais une latence sur **un** `flow_*` → latence
  applicative (index manquant / N+1) sur cet endpoint.
`summarize.py` propose déjà une inférence automatique du goulot.

## 9. Recommandations — MODÈLE (à confirmer par les mesures)
> À ne renseigner **qu'avec des chiffres** ; ne pas préjuger d'un goulot.

- **P0** _(bloquant avant multi-établissement)_ : ex. pool/`max_connections`
  sous-dimensionnés si saturation < 500 VU.
- **P1** _(avant national)_ : ex. index manquant sur l'endpoint le plus lent ;
  PgBouncer si `max_connections` est le mur ; cache des KPI dashboard.
- **P2** _(optimisations)_ : pagination/So N+1, tuning Redis, réglage worker.

## 10. Propositions d'optimisation candidates (à valider par mesure)
Aucune n'est appliquée (règle : pas de changement d'archi sans mesure).
Pistes classiques à confirmer : pooling externe (PgBouncer), index ciblés,
cache court sur KPIs, taille de pool `SQLALCHEMY` alignée sur
`max_connections`, réglage du nombre de workers Arq, réplicas API derrière
le LB. **Chaque piste devra citer la mesure qui la justifie.**

## 11. Premier run réel (2026-09-21) — ce qui a changé

Pour la première fois depuis l'écriture de ce document, `k6` a été
installé et un run réel a été exécuté contre une instance vivante
(backend local, PostgreSQL + Redis réels, migrations à jour — pas Docker
Compose, indisponible dans cet environnement, mais une pile fonctionnelle
équivalente pour ce qui est mesuré ici).

**Ce qui A été vérifié** : `load-tests/smoke.js` (5 VU, ~1 min, aucune
authentification) contre l'instance vivante.

**Ce qui n'a PAS été vérifié** : les paliers 250/500/1000/2500 VU de
`campaign.js`/`saturation.js`/`resilience.js`. Une seule machine
générant tout le trafic depuis une seule IP source n'est de toute façon
pas une simulation crédible d'une charge nationale réelle (traffic
distribué, sources multiples) — les valider correctement demande une
exécution distribuée (k6 Cloud, plusieurs runners) contre un
environnement dimensionné comme la production, pas ce sandbox.

### Constat n°1 (bloquant, désormais corrigé) : le run révèle son propre goulot d'étranglement, pas celui de l'app

Premier run de `smoke.js` : **49% des requêtes en échec (HTTP 429)**, dès
5 VU / ~11 req/s — bien avant toute charge réelle. Cause : le limiteur de
débit global par défaut de `app/main.py` (`100/minute` par IP,
`app/core/client_ip.py`) s'applique à **toute** requête sans limiteur
dédié, y compris `/health/ready` et `/health/live`. Un run k6, où toutes
les requêtes proviennent d'une seule IP source, épuise ce quota en
quelques secondes.

Confirmé par test contrôlé : `k6` avec `console.log(r.status)` sur
`/health/ready`, 5 VU/20 s sans `sleep()` → 7475 `429` contre 68 `200`.

**Correction appliquée** (`app/core/client_ip.py::get_client_ip_or_load_test_bypass`,
`app/main.py`) : le bypass `X-Load-Test-Token` déjà audité pour le
limiteur de connexion (`auth.py`, voir `LOAD_TEST_BYPASS_SECRET` dans
`app/core/config.py`) est étendu au limiteur global de l'application —
inerte par défaut, comparaison à temps constant, expiration obligatoire
(`LOAD_TEST_BYPASS_EXPIRES_AT`), sans nouveau mécanisme de sécurité à
auditer séparément. Re-run de `smoke.js` avec le jeton : **0% d'échec,
916/916 checks réussis**.

### Constat n°2 (bloquant, désormais corrigé) : le bypass n'était câblé que sur le login

En examinant `lib/scenarios.js`, `full-journey.js`, `api-baseline.js` à
la lumière du constat n°1 : `X-Load-Test-Token` n'était attaché **qu'à
la requête de connexion** dans `campaign.js`/`saturation.js`/
`resilience.js`/`full-journey.js` — jamais aux appels métier réels qui
suivent (tableau de bord, élèves, notes, présences, factures...). Sans
correctif, n'importe quel run réel de ces scripts aux paliers 250-2500 VU
aurait immédiatement buté sur le même 429 massif que le constat n°1, sur
des endpoints n'ayant rien à voir avec le login — invisible sans avoir
réellement exécuté k6 une fois contre une instance vivante.

**Correction appliquée** : `lib/scenarios.js::authHeaders()` (utilisée
par tous les flux métier de `campaign.js`/`saturation.js`/
`resilience.js`) et les fonctions équivalentes de `full-journey.js` et
`api-baseline.js` attachent désormais `X-Load-Test-Token` à **chaque**
requête, pas seulement au login.

### Ce que ça change pour la suite

Les paliers 250/500/1000/2500 VU restent à exécuter pour de vrai — mais
avant ce correctif, ils auraient produit des résultats **entièrement
faux** (un mur de 429 dès les premières secondes, quel que soit le palier
visé), rendant toute mesure de saturation applicative impossible à
distinguer du bruit de ce garde-fou. C'était un prérequis bloquant non
identifié avant ce run, pas une optimisation — sans lui, "Test national
1000+" ne pouvait tout simplement pas être mesuré avec l'outillage
existant, quelle que soit la puissance de la machine cible.
