# Campagne de charge réelle — 2026-08-07

Première exécution réelle de `load-tests/full-journey.js` (palier TIER=10),
contre la stack Docker locale — jamais contre la production, conformément
à la règle du runbook (`docs/runbooks/load-testing.md`).

## Contexte

- Stack cible : Docker Compose local (`api`, `worker`, `postgres`, `redis`),
  mise à jour sur `origin/main` juste avant la campagne (incluait les
  PR #89/#90 — le script `full-journey.js` lui-même, non testé jusque-là).
- 10 tenants synthétiques provisionnés (`loadtest-01` à `loadtest-10`),
  chacun avec un compte TENANT_ADMIN et un élève de test — jamais le
  tenant pilote réel (`uls`).
- k6 exécuté via l'image Docker officielle (`grafana/k6`), sur le même
  réseau Docker que la stack, aucune installation sur l'hôte.

## Bugs trouvés en écrivant/exécutant le script (corrigés dans ce commit)

Le script tel que mergé en PR #90 n'avait jamais été réellement exécuté —
3 bugs auraient fait échouer silencieusement une bonne partie de la
campagne :

1. **`/analytics/overview/` n'existe pas** — `analytics.py` expose des
   endpoints granulaires (`academic-kpis`, `financial-kpis`, ...), pas de
   vue d'ensemble générique. Même bug préexistant dans
   `load-tests/api-baseline.js` — corrigé aussi.
2. **`/imports/students/preview/` → 404** — le routeur est monté sur
   `/import` (singulier), pas `/imports/`.
3. **Payload de `POST /school-life/check-ins/` invalide** — le schéma
   réel (`StudentCheckInCreate`) exige `student_id` ; le script envoyait
   `check_in_type`/`method`/`notes`, des champs qui n'existent pas.
4. **`POST /payments/intent/` mal modélisé** — prend `amount`/`method` en
   query params (pas un body JSON) et exige un `invoice_id` existant.
   Remplacé par `GET /invoices/` (lecture), qui exerce le même module
   finance sans dépendre de factures pré-créées.

Deux autres obstacles opérationnels rencontrés et documentés pour la
prochaine campagne :
- **Rate limit de connexion (5/minute par IP)** — `setup()` doit espacer
  les logins de 13s ; à `TIER=100`+, ce coût de setup devient lui-même un
  facteur limitant (voir "Limites connues" plus bas).
- **Limite de sessions actives (5 par utilisateur)** — des tests manuels
  répétés (curl) sur le même compte suffisent à la déclencher ; sans
  rapport avec le comportement sous charge réelle.

## Deux profils testés

### 1. Mode développement (`uvicorn --reload`, 1 processus) — `DEBUG=true`

C'est le mode dans lequel la stack locale tournait par défaut.

| Métrique | Résultat |
|---|---|
| Requêtes HTTP | 1218 |
| Taux d'échec HTTP | 2.05% |
| Itérations complètes | 83 (21 interrompues à l'arrêt) |
| `http_req_duration` p95 / p99 | 3.01s / **59.99s** |
| CPU conteneur `api` (snapshot mi-charge) | 6.2% (1 cœur) |

### 2. Mode production (`gunicorn` × 4 workers) — `DEBUG=false`, `WORKERS=4`

Redémarrage du conteneur `api` avec le profil de démarrage réellement
utilisé en production Render (`start.sh`), `ENFORCE_MFA=false` pour cette
seule campagne (les comptes de test synthétiques n'ont pas d'MFA
enrôlée — sans ce réglage, `require_plan`/MFA obligatoire bloque tout
login TENANT_ADMIN en mode non-DEBUG, un contrôle de sécurité réel et
volontaire qu'il ne s'agissait pas de tester ici).

| Métrique | Résultat |
|---|---|
| Requêtes HTTP | 4158 (**3.4× le débit du mode dev**) |
| Taux d'échec HTTP | 0.33% |
| Itérations complètes | 311 (25 interrompues à l'arrêt) |
| `http_req_duration` p95 / p99 | 1.48s / 2.54s |
| CPU conteneur `api` (snapshot mi-charge) | 235.5% (~2,4 cœurs actifs sur 4) |
| CPU conteneur `postgres` (snapshot mi-charge) | 48.9% |

**Conclusion immédiate** : le mode développement (celui dans lequel cette
stack locale tournait par défaut) n'est absolument pas représentatif —
un seul processus uvicorn ne peut pas absorber une charge concurrente
réaliste. Le mode production (gunicorn multi-workers, identique à ce que
`start.sh` utilise sur Render) donne un résultat 3 à 8× meilleur sur
quasiment toutes les métriques. **Toute lecture de capacité doit se faire
en mode production, jamais en mode développement.**

## Détail par parcours (mode production, TIER=10, 25 VUs en pointe)

| Parcours | p95 | Verdict vs seuil |
|---|---|---|
| `dashboard` (analytics + élèves + notifications) | 4.09s | ✗ (seuil 500ms) |
| `public_pages` (nav + page publique, sans auth) | 844ms | ✗ (seuil 400ms) |
| `contact_form` (formulaire public) | 1.25s | ✗ (seuil 600ms) |
| `imports_legers` (aperçu CSV) | 1.42s | ✓ (seuil 1.5s) |
| `paiements` (liste factures) | 1.33s | ✗ (seuil 800ms) |
| `whatsapp_simule` (webhook) | 758ms | ✗ (seuil 500ms) |
| `offline_sync_simule` (5 check-ins consécutifs) | **9.40s**, max **64.3s** | ✗✗ (seuil 2s) — de très loin le pire parcours |

Tous les seuils par parcours étaient volontairement stricts (objectifs
cible, pas des minimums acceptables) — les dépassements ne signifient pas
"cassé", mais donnent une base de comparaison chiffrée pour la prochaine
campagne après optimisation.

## Constat principal : la rafale de synchronisation hors-ligne

`offline_sync_simule` (5 `POST /school-life/check-ins/` consécutifs, sans
temps de réflexion, simulant un appareil qui vide sa file à la
reconnexion) est systématiquement le parcours le plus lent, avec un écart
énorme entre la médiane (869ms) et la queue (p95=9.4s, max=64s) — signe
de contention plutôt que de lenteur uniforme. Une requête a même expiré
purement et simplement (`request timeout`) en fin de campagne.

Cause probable à investiguer en priorité (non confirmée dans cette
session, pas d'accès aux logs SQL détaillés ni à `pg_stat_activity`
pendant le run) : plusieurs VUs du même tenant écrivant des check-ins
pour le **même élève de test unique** (un seul élève seedé par tenant
pour cette campagne) — un verrou ligne ou une contrainte sur
`student_id` combinée à l'absence de connexions DB disponibles dans le
pool sous cette rafale concentrée en est le suspect le plus probable.

## Limites connues de cette campagne

- **Échelle** : TIER=10 uniquement (25 VUs). TIER=100/1000 n'ont pas été
  exécutés — le coût de `setup()` (13s × nombre de tenants pour respecter
  le rate-limit de connexion) devient lui-même un obstacle à ces paliers
  (≈22 min pour 100 tenants, ≈3h40 pour 1000) : une vraie campagne à ces
  paliers nécessite soit plusieurs adresses IP sources, soit un mécanisme
  de bypass du rate-limit de connexion pour un runner de charge identifié,
  à concevoir avant la prochaine campagne.
- **Matériel** : poste de développement partagé (pas un environnement
  dédié), Postgres/Redis en conteneurs à ressources limitées (512Mo/128Mo)
  — les chiffres absolus ne représentent PAS la capacité de l'infra Render
  réelle, seulement le comportement relatif dev vs production et les
  parcours qui dégénèrent sous charge concurrente.
- **`ENFORCE_MFA=false`** — désactivé uniquement pour cette campagne
  (comptes synthétiques sans MFA enrôlée). Ne jamais désactiver ce
  réglage en production réelle.

## Prochaines étapes recommandées

1. Investiguer la contention sur `offline_sync_simule` avec
   `EXPLAIN ANALYZE` / `pg_stat_activity` pendant une rafale reproduite
   manuellement.
2. Concevoir un mécanisme de connexion sans rate-limit pour un runner de
   charge identifié (ex. IP allowlistée, ou jeton de service), condition
   préalable à toute campagne TIER=100/1000 réaliste.
3. Répéter cette campagne contre un environnement de staging dimensionné
   comme la production réelle (pas un poste de développement partagé).

---

## Suite — 2026-08-10 : corrections des deux blocages + re-mesure

Les deux actions recommandées ci-dessus (#1 et #2) ont été traitées.

### #2 — Bypass du rate-limit de connexion pour un runner de charge

`app/api/v1/endpoints/core/auth.py::_login_rate_limit_key` — une requête
portant l'en-tête `X-Load-Test-Token` égal à `LOAD_TEST_BYPASS_SECRET`
(vide par défaut, comparaison `secrets.compare_digest`) est exemptée du
rate-limit de connexion (5/minute/IP) pour cette seule requête. Inerte tant
que l'opérateur ne configure pas explicitement le secret — ne jamais le
faire en production de façon permanente. `load-tests/full-journey.js`
utilise `LOAD_TEST_TOKEN` en variable d'environnement k6 ; sans elle, le
script retombe sur l'espacement 13s d'origine (comportement inchangé).

Effet mesuré : `setup()` pour 10 tenants passe de ~130s à **~1s**.
100 tenants (jamais testé avant faute de ce mécanisme) devient praticable
au lieu de prendre ~22 minutes.

### #1 — Diagnostic de la contention (sans accès `pg_stat_activity` en direct)

Analyse du code (pas d'observation en direct pendant un run — toujours une
limite de cet environnement) : `get_db()` (`app/core/database.py`) payait
**3 aller-retours réseau vers Postgres avant même la première requête
métier** — un `SELECT 1` de liveness redondant avec `pool_pre_ping=True`
(qui fait déjà cette vérification, en silence, à l'emprunt d'une connexion
du pool), et deux appels `set_config` séparés (reset puis affectation) là
où un seul suffit (`set_config` accepte `NULL` directement — vérifié en
direct contre le Postgres réel de la stack). Sur un pool à 5 connexions
stables + 10 en débordement par worker (`DATABASE_POOL_SIZE`/
`DATABASE_MAX_OVERFLOW`, la valeur par défaut), chaque round-trip est du
temps de connexion retenue en moins disponible pour les autres requêtes en
attente — exactement le sympôme observé (médiane correcte, queue énorme).

**Corrigé** : les deux `set_config` fusionnés en un seul appel ; le
`SELECT 1` supprimé sur PostgreSQL (conservé sur SQLite, qui n'a pas
`pool_pre_ping`). RLS re-vérifiée directement contre Postgres réel après
correction (isolation tenant intacte, testé avec deux tenants distincts).

### Re-mesure — même palier (TIER=10, 25 VUs), mode production, avant/après

| Métrique | Avant (07/08) | Après (10/08) | Delta |
|---|---|---|---|
| `flow_offline_sync_burst_ms` p95 | 9,40s | **5,91s** | -37% |
| `flow_offline_sync_burst_ms` max | **64,3s** | **9,79s** | -85% |
| `http_req_duration` p99 | 2,54s | 2,26s | -11% |
| `http_req_failed` | 0,33% | 0,14% | -58% |
| Itérations complétées | 311 | 309 | ≈ stable |

Amélioration réelle et mesurée, concentrée exactement là où elle était
attendue : le pire cas (max) de la rafale hors-ligne, celui qui faisait le
plus mal à un vrai utilisateur, passe de plus d'une minute à moins de 10
secondes. Les seuils par parcours restent dépassés (ils étaient fixés comme
objectifs, pas comme minimums) — la contention est réduite, pas éliminée :
`DATABASE_POOL_SIZE`/`MAX_OVERFLOW` restent à leur valeur par défaut (5+10
par worker) dans cette campagne, volontairement, faute de connaître la
limite réelle de connexions du plan PostgreSQL Render en production (voir
le commentaire ajouté dans `app/core/config.py` — l'augmenter sans cette
information pourrait faire échouer des connexions plutôt que les faire
simplement attendre).

### Ce qui manque encore pour un vrai test à 10 000 utilisateurs simultanés

Voir `docs/runbooks/load-testing.md#exigences-pour-un-test-a-10-000-utilisateurs`
pour le détail complet. En résumé : ce poste de développement partagé
(Postgres/Redis à 512 Mo/128 Mo, CPU partagé avec d'autres charges) ne
peut physiquement pas simuler 10 000 utilisateurs de façon représentative
— au-delà de quelques centaines de VUs locaux, on mesurerait la limite du
poste, pas celle de l'application. Un test à cette échelle demande un
environnement de staging dimensionné comme la cible de production réelle.
