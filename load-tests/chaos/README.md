# Scénarios de résilience (chaos)

> ⚠️ **Local / staging uniquement.** Jamais contre la production.

Objectif : vérifier que la plateforme **dégrade gracieusement** (429/503
contrôlés, pas de 5xx en masse, pas de corruption) et **récupère
automatiquement** une fois la panne levée — pas d'obtenir un run vert.

## Outillage
- `inject.sh <fault> <up|down>` — injecte/lève une panne unitaire.
- `run-resilience.sh` — pour chaque panne : baseline → injection + `resilience.js`
  → levée → fenêtre de récupération, avec `capture-infra-metrics.sh` en parallèle.

## Pannes couvertes (mappées au brief)
| fault | injection | ce qu'on observe |
|---|---|---|
| `redis_down` | `stop redis` | blacklist/logout-all/lockout/cache → politique fail-open vs 503 privilégié (cf. #152) ; récupération |
| `redis_slow` | tc netem +300ms | latence p95/p99, timeouts, files d'attente |
| `worker_stopped` | `stop worker` | jobs Arq s'accumulent (`arq_queue_pending`) sans 5xx côté API ; drain au redémarrage |
| `worker_saturated` | flood de jobs | profondeur de file, latence de traitement, back-pressure |
| `postgres_saturated` | N connexions idle-in-tx | `max_connections` PG + **pool** app (503 attendu, pas de hang) |
| `storage_down` | `stop minio` | uploads/downloads objets dégradent proprement |
| `network_timeout` | tc netem delay+loss sur API | timeouts réseau, retries, idempotence |

## Prérequis latence réseau (`redis_slow`, `network_timeout`)
`tc`/netem exige `iproute2` + `NET_ADMIN` dans le conteneur. `inject.sh`
tente d'installer `iproute2` à la volée ; sinon, préférer
[`pumba`](https://github.com/alexei-led/pumba) ou
[`toxiproxy`](https://github.com/Shopify/toxiproxy) (proxy devant Redis/API) —
plus robustes et n'exigent pas de modifier l'image.

## Invariants à vérifier
- `idempotent_replay_DIVERGENT` **= 0** (retry/idempotence : rejouer une
  écriture avec le même `X-Idempotency-Key` ne double-applique jamais).
- Pas de 5xx soutenu pendant la panne (back-pressure 429/503 acceptable).
- Après la levée, error-rate et p95 reviennent à la baseline (récupération).
- `offline_resync` massif (RESYNC_SIZE=40) ne perd ni ne duplique d'items.
