# Provisionner des tenants synthétiques pour les tests de charge

Les scripts k6 (`campaign.js`, `saturation.js`, `resilience.js`) ne créent
**jamais** de tenant ni de compte : la création de compte est elle-même
rate-limitée et n'a pas sa place dans une boucle de charge. Ils lisent un
fichier `TENANTS_FILE` (JSON) listant des tenants **déjà provisionnés** sur
l'environnement cible (local Docker ou staging dédié).

> ⚠️ **Jamais contre la production.** Voir `docs/runbooks/load-testing.md`.

## Schéma du fichier

Tableau JSON d'objets (voir `load-tests/tenants.sample.json`) :

| champ | requis | usage |
|---|---|---|
| `slug` | ✅ | résolution tenant (`X-Tenant-ID`) |
| `email` / `password` | ✅ | login (une fois par tenant dans `setup()`) |
| `student_id` | pour les écritures | présences, notes, résultats, resync offline |
| `subject_id` | optionnel | rattache note/présence à une matière |
| `classroom_id` | optionnel | rattache la présence à une classe |
| `assessment_id` | optionnel | rattache la note à une évaluation |

Sans les `*_id`, les scénarios d'écriture se **désactivent proprement**
(le test reste valide en lecture seule) — `WRITE_SCENARIOS=1` n'écrit que
pour les tenants qui portent au moins `student_id`.

## Dimensionnement

- **250 VU (baseline)** / **500 VU** : 20–50 tenants suffisent (charge
  répartie, pas de point chaud sur un seul tenant).
- **1000 / 2500 VU** : viser ≥ 100 tenants pour rester réaliste (une charge
  nationale = beaucoup d'établissements, pas un seul surchargé).

## Provisionnement (exemple)

Adapter à l'environnement. Principe : créer les tenants + un admin par tenant
via l'API d'admin/bootstrap, puis récupérer un `student_id` par tenant.

```bash
# 1) Créer les tenants + comptes admin (script d'admin de l'app, hors boucle
#    de charge). Exemple d'orientation — utiliser l'outillage existant :
#      backend/scripts/seed_demo_tenants.py
#      backend/scripts/create_admin.py
python backend/scripts/seed_demo_tenants.py --count 100 --prefix loadtest

# 2) Pour chaque tenant, récupérer un student_id (et éventuellement
#    subject/classroom/assessment) via l'API, puis composer le JSON.
#    Exemple d'appel (pseudo) :
#      GET /api/v1/students/?page=1&page_size=1  → .items[0].id
```

## Bypass du rate-limit login (paliers élevés)

Le login est limité à **5/min par IP**, et tous les VU k6 partagent l'IP du
générateur. Pour 100+ tenants, définir sur la cible la variable
`LOAD_TEST_BYPASS_SECRET` (+ `LOAD_TEST_BYPASS_EXPIRES_AT` dans le futur, cf.
`auth.py`) et passer la même valeur à k6 via `--env LOAD_TEST_TOKEN=…` : les
logins de `setup()` portent alors `X-Load-Test-Token` et sont exemptés. Sans
ce jeton, `setup()` espace les logins de 13 s (sûr mais lent au-delà d'une
poignée de tenants).

> Ce bypass ne concerne **que** le rate-limit du login (cf.
> `_login_rate_limit_key`), **jamais** l'authentification elle-même.
