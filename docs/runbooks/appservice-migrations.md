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

Une migration **additive** (nouvelle fonction, suppression de politique
inutilisée, colonne nullable…) est compatible avec le code encore en place :
on migre d'abord, on déploie ensuite. Une base en avance n'empêche pas l'ancien
code de démarrer ; une base en retard bloque le nouveau.

## 3. Déployer l'application

`deploy-appservice.yml` (`api+worker`, release `release-<sha>`, approbation
de l'environnement Production) — voir `docs/runbooks/appservice-deploy.md`.

## 4. Vérifier (lecture seule)

- `GET /health/ready` : `schema: up_to_date`, `rls: active`, release attendue ;
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
