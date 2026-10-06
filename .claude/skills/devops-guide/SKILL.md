---
name: devops-guide
description: CI/CD et infrastructure Academy Guinéenne — workflows GitHub Actions (ci, build-images, deploy), images immuables par SHA, job de migration séparé, Docker Compose local, IaC, probes santé, secrets. À utiliser pour modifier la CI, Docker, l'IaC, ou préparer/relire un déploiement.
---

# DevOps / CI-CD

Sources de vérité : `.github/workflows/*.yml`, `docs/IMMUTABLE_RELEASES.md`,
`docs/AZURE_ONE_SHOT_MIGRATIONS.md`, `docs/AZURE_OBSERVABILITY.md`,
`docs/runbooks/`, `infra/azure/README.md`, `docker/README.md`.

## Principes (indépendants du cloud)

1. **Build once, promote many** : une image par SHA Git, promue d'environnement en
   environnement ; jamais de tag mutable (`latest`) en déploiement.
2. **Migrations = étape dédiée** avant le déploiement applicatif, avec un rôle DB
   admin séparé ; l'application ne fait jamais de DDL.
3. **Déploiement manuel et protégé** (environnements GitHub avec approbation).
   Claude ne déclenche **jamais** un déploiement.
4. **Secrets** : gestionnaire de secrets / variables d'environnement de la plateforme,
   identité fédérée (OIDC) plutôt que secrets statiques. Jamais dans le dépôt.
5. **Probes** : `/health/live` (processus), `/health/ready` (DB, RLS, Redis,
   stockage, révision Alembic), `/health/deep` protégé.
6. **IaC** : toute modification d'infra passe par le code (`infra/`) et un
   what-if/plan relu avant application.

## CI (`ci.yml`) — ce qui doit rester vert

Frontend (lint avec budget, type-check, i18n, Vitest + couverture, build),
smoke Playwright, backend SQLite (couverture minimale), backend PostgreSQL
(migrations + exercice backup/restore + tests), sécurité (npm audit et pip-audit
avec seuils de sévérité, gitleaks). Lire le fichier pour les valeurs exactes.

## Modifier la CI / l'infra (changement important)

- Plan : quel job, quel risque (gate affaibli ? secret exposé ? coût ?), rollback.
- Ne jamais affaiblir un gate (seuil, `continue-on-error`, budget relevé) sans
  accord explicite et justification écrite dans le fichier.
- Actions tierces : version épinglée (tag majeur au minimum, SHA de préférence).
- Permissions de workflow minimales (`permissions:`).
- Docker : image de base épinglée, utilisateur non-root, pas de secret en `ARG`/`ENV`,
  `.dockerignore` à jour.

## Local

```bash
docker compose --env-file .env.docker up -d --build   # toujours --env-file
bash scripts/smoke-docker.sh                          # smoke de référence
```

`docker compose down -v` détruit les volumes (données) : validation explicite requise.

## Cibles héritées

`render.yaml`, `netlify.toml`, `server.mjs`, `Dockerfile.render` : ne pas les
étendre ; signaler toute divergence de configuration avec la cible principale.
