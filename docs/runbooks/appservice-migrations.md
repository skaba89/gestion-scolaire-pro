# Runbook — migrations de schéma en production (App Service + Neon)

**Pourquoi ce runbook existe.** La production actuelle (App Service
`academy-guineenne-api` / `-worker`, base Neon) n'a pas de job de migration
automatique : `deploy-appservice.yml` ne fait que changer l'image, et le job
« one-shot » de `docs/AZURE_ONE_SHOT_MIGRATIONS.md` ne concerne que la cible
Azure Container Apps. Or l'API **refuse de démarrer** si la base est en
retard sur le code (`/health/ready` → `schema`). Chaque PR qui ajoute une
migration doit donc suivre cette procédure **avant** son déploiement.

Règles :

- chaque étape qui écrit en production demande une **validation explicite**
  (CLAUDE.md, « Opérations interdites sans validation ») ;
- les migrations s'exécutent avec le **rôle propriétaire** (`neondb_owner`,
  superutilisateur Neon/BYPASSRLS), jamais avec les rôles runtime
  `schoolflow_api` / `schoolflow_worker` ;
- la chaîne de connexion n'est **jamais affichée, journalisée ni copiée** :
  elle passe d'une commande à l'autre par une variable d'environnement.

Variables : projet Neon `ancient-feather-57701824`, branche `production`,
base `neondb`.

## 0. Préparer

```bash
git switch main && git pull --ff-only
cd backend
python -m venv .venv-migrate && .venv-migrate/Scripts/python -m pip install -r requirements.txt   # (Linux : .venv-migrate/bin/python)
alembic heads        # une seule head attendue — c'est la cible
neonctl me           # authentifié
```

`alembic/env.py` utilise `DATABASE_URL_MIGRATIONS` s'il est défini, sinon
`DATABASE_URL_SYNC`.

## 1. Répétition sur une branche Neon jetable

```bash
P=ancient-feather-57701824
B=rehearsal-$(date -u +%Y%m%d-%H%M)
neonctl branches create --project-id "$P" --name "$B" --parent production

DATABASE_URL_MIGRATIONS="$(neonctl connection-string "$B" --project-id "$P" \
  --role-name neondb_owner --database-name neondb)" \
  python -m alembic upgrade head

DATABASE_URL_MIGRATIONS="$(neonctl connection-string "$B" --project-id "$P" \
  --role-name neondb_owner --database-name neondb)" \
  python -m alembic current          # doit afficher la head
```

Vérifier ce que la migration annonce (objets créés/supprimés, politiques RLS)
par des requêtes **en lecture seule** sur la branche. En cas d'erreur :
corriger la PR — la production n'a pas été touchée.

## 2. Production (validation explicite requise)

Noter l'heure UTC exacte juste avant (point de restauration Neon) :

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
DATABASE_URL_MIGRATIONS="$(neonctl connection-string production --project-id "$P" \
  --role-name neondb_owner --database-name neondb)" \
  python -m alembic upgrade head
DATABASE_URL_MIGRATIONS="$(neonctl connection-string production --project-id "$P" \
  --role-name neondb_owner --database-name neondb)" \
  python -m alembic current
```

**Fenêtre entre migration et déploiement** (P2, `app/core/schema_compat.py`,
à partir de la release qui embarque `20261008_0001`). Dès la fin de
`alembic upgrade`, l'API encore en place voit une base **en avance** sur son
code :

- si **toutes** les nouvelles migrations sont déclarées
  `backward_compatible = True` (enregistrées dans `schema_migration_compat`),
  elle reste prête : `/health/ready` → 200, `schema: ahead_compatible`, et
  elle redémarre normalement (avertissement dans les journaux) ;
- si **une seule** est `False` (ou non enregistrée) : `schema: incompatible`,
  503 et refus de démarrer en cas de redémarrage — comme l'ancien contrôle strict.

Vérifier avant l'étape 2 : `grep -n backward_compatible` sur les migrations
à appliquer. Dans les deux cas, enchaîner le déploiement (étape 3) ; avec une
migration `False`, le faire **immédiatement** (approbation Production prête),
ou revenir par `alembic downgrade` si le déploiement ne peut pas suivre.
Coupe-circuit : réglage App Service `SCHEMA_COMPAT_MODE=strict` (égalité
exacte, sans redéploiement).

Historique : avant P2 (release `6929008` et antérieures), le contrôle exigeait
l'égalité stricte — incident du 2026-10-07 : ~10 min de readiness 503 sans
interruption de trafic. **La migration `20261008_0001` elle-même s'applique
encore sous ce contrôle strict** (le code en place ne le connaît pas) :
l'enchaîner immédiatement avec son déploiement.

L'ordre inverse (déployer avant de migrer) n'est pas une alternative : le
nouveau code refuserait de démarrer face à une base en retard (`outdated`).

## 3. Déployer l'application

`deploy-appservice.yml` (`api+worker`, release `release-<sha>`, approbation
de l'environnement Production) — voir `docs/runbooks/appservice-deploy.md`.

## 4. Vérifier (lecture seule)

- `GET /health/ready` : `schema: up_to_date` (après déploiement), `rls: active`, release attendue ;
- rôles runtime inchangés (`schoolflow_api` / `schoolflow_worker`) ;
- la vérification fonctionnelle propre à la PR.

## 5. Nettoyer

```bash
neonctl branches delete "$B" --project-id "$P"
```

## Rollback

1. Code : redéployer la release précédente (`deploy-appservice.yml`,
   `verify_revision` selon le cas).
2. Schéma : `alembic downgrade -1` avec la même commande que l'étape 2 (les
   migrations de ce dépôt sont réversibles), ou restauration Neon de la
   branche `production` à l'heure notée à l'étape 2.

## Historique

| Date | Révisions | Notes |
|---|---|---|
| 2026-10-04 | `20260921_0002` → `20260930_0001` | manuel, répété sur branche Neon (voir `STATUT_ACTUEL.md`) |
| 2026-10-07 | `20260930_0001` → `20261007_0002` | #280 — répétée sur `rehearsal-20261007-1127` (supprimée ensuite) ; production migrée à 11:49 UTC (point de restauration `2026-10-07T11:49:20Z`) ; release `6929008` déployée ensuite — readiness 503 ~10 min dans l'intervalle (voir l'avertissement de l'étape 2) |
| 2026-10-08 | `20261007_0002` → `20261008_0001` | #282 (P2) — répétée sur `rehearsal-20261008-0658` (supprimée) ; production migrée à 07:07 UTC (point de restauration `2026-10-08T07:07:11Z`) ; release `cdee25b` déployée à 07:21 UTC — dernière fenêtre 503 (code en place encore strict) ; ensuite readiness 200 `up_to_date` |
