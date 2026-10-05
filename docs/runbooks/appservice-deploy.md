# Runbook — déploiement App Service par digest (`deploy-appservice.yml`)

**Statut : exécuté le 2026-10-04 (API + worker, `release-70e28278…`, run
37237576241) ; frontend jamais encore déployé par ce workflow.** Chaque
lancement est une mise en production : validation explicite requise (CLAUDE.md).

## Prérequis (une fois, par un administrateur)

GitHub → Settings → Environments → `production` :

| Type | Nom | Valeur |
|---|---|---|
| Règle | Required reviewers | au moins une personne (aujourd'hui : aucune règle) |
| Secret | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | identité OIDC (credential fédéré GitHub), rôle limité au groupe de ressources |
| Variable | `APPSERVICE_RESOURCE_GROUP` | `academy-guineenne-rg` |
| Variable | `APPSERVICE_API` / `APPSERVICE_WORKER` / `APPSERVICE_FRONTEND` | `academy-guineenne-api` / `-worker` / `-frontend` |
| Variable | `API_PUBLIC_URL` / `WORKER_PUBLIC_URL` / `FRONTEND_PUBLIC_URL` | URL `https://…azurewebsites.net` de chaque app |
| Variable | `ACR_LOGIN_SERVER` | `academyguineenneacr.azurecr.io` |

App Service **worker** (une fois, avant le premier déploiement worker) :
`WORKER_HEALTH_PORT=8000` et `WEBSITES_PORT=8000` (sonde HTTP du worker, voir
`docs/AZURE_OBSERVABILITY.md`). Sans eux, la vérification worker échoue.

App Service **frontend** : image `schoolflow-frontend-appservice`
(`Dockerfile.appservice`, entrée `frontend_appservice` du manifeste). Réglages
utilisés : `PORT` / `WEBSITES_PORT` = `10000`, URL de l'API dans
`SCHOOLFLOW_API_URL` ou, à défaut, `VITE_API_URL` (origine `https://…`, sans
chemin ; le conteneur refuse de démarrer sinon), `CSP_CONNECT_SRC` facultatif.
`BACKEND_HOST` / `BACKEND_PORT` ne servent plus (aucun proxy). Une release
antérieure à cette image n'a pas de `frontend_appservice` : la cible
`frontend` est alors refusée.

## Ce que fait le workflow

1. Valide les entrées (aucune interpolation dans les scripts), la release
   (`release-<sha>` publiée par `github-actions[bot]`, commit dans
   l'historique de `main`), le manifeste (registre = `ACR_LOGIN_SERVER`,
   digests `sha256`).
2. Note les images en place (référence de rollback, résumé du run).
3. Remplace **uniquement** `linuxFxVersion` par `repo@sha256:…` (aucun App Setting écrit).
4. Attend que `/health/live` de l'API et du worker renvoie la **révision de
   l'image** (`backend.tag` du manifeste), puis `/health/ready` de l'API.

## Limites connues

- **Images antérieures à l'intégration de `RELEASE_SHA`** (avant #270) :
  `/health/live` renvoie `unknown`. Pour un rollback vers l'une d'elles,
  lancer avec `verify_revision = false` (contrôle de disponibilité seulement).
- **Frontend** : `/healthz` renvoie la révision (`frontend_appservice.tag`),
  vérifiée comme pour l'API, puis `/` doit répondre 200.
- **Présence d'un SUPER_ADMIN sous rôle NOBYPASSRLS** : sa propre ligne
  `user_presence` reste rattachée au premier établissement visité (la RLS
  empêche de la déplacer ; la requête échoue fermée, 400, sans écriture).
  Fonctionnalité secondaire, aucun impact d'isolation.

## Rollback

Relancer le workflow avec la release précédente (ou `verify_revision = false`
pour une image antérieure à #270), ou, en urgence, remettre l'image notée à
l'étape « Record current images » :
`az webapp config set --name <app> --resource-group <rg> --linux-fx-version "DOCKER|<image précédente>"`.
