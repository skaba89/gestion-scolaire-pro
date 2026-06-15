# Runbook — CI Docker PostgreSQL

Ce runbook explique le garde-fou ajouté au workflow CI pour éviter les erreurs Docker liées aux variables d'environnement manquantes.

## Objectif

Le job `Backend Tests (PostgreSQL)` doit être autonome dans GitHub Actions. Il ne doit pas dépendre d'un fichier `.env.docker` local non versionné.

## Principe

Le workflow génère un fichier temporaire `.env.docker.ci` pendant l'exécution CI, puis l'utilise explicitement avec :

```bash
docker compose --env-file .env.docker.ci -f docker-compose.yml config
docker compose --env-file .env.docker.ci -f docker-compose.yml up postgres -d --wait
```

## Pourquoi c'est important

Sans fichier d'environnement complet, `docker compose` peut échouer avant même de démarrer PostgreSQL, par exemple si une variable comme `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD`, `SECRET_KEY` ou `BOOTSTRAP_SECRET` est attendue par le compose.

## Vérification locale équivalente

```bash
cp .env.docker.example .env.docker
# remplir les valeurs CHANGE_ME

docker compose --env-file .env.docker config
docker compose --env-file .env.docker up postgres -d --wait
```

## Règle projet

Ne jamais commiter `.env.docker` ou un vrai fichier `.env`. Seuls les fichiers d'exemple et les environnements CI temporaires sont autorisés.
