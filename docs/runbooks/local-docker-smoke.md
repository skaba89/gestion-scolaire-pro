# Runbook — Smoke test Docker local

Ce runbook sert à vérifier rapidement que la stack Docker locale démarre correctement sans toucher aux fonctionnalités métier.

## Préparation

```bash
cp .env.docker.example .env.docker
```

Remplacer toutes les valeurs `CHANGE_ME` dans `.env.docker`.

Valeurs importantes à vérifier :

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `SECRET_KEY`
- `BOOTSTRAP_SECRET`
- `ADMIN_DEFAULT_PASSWORD`
- `BACKEND_CORS_ORIGINS=http://localhost:3000`
- `VITE_API_URL=/api` pour Docker

## Lancer le smoke test

```bash
bash scripts/smoke-docker.sh
```

Le script vérifie :

1. `docker compose config`
2. démarrage de PostgreSQL, Redis, MinIO, API et frontend
3. endpoint API `/health/`
4. endpoint API `/`
5. frontend `http://localhost:3000/`

## Personnalisation

```bash
ENV_FILE=.env.docker \
COMPOSE_FILE=docker-compose.yml \
API_URL=http://localhost:8000 \
FRONTEND_URL=http://localhost:3000 \
TIMEOUT_SECONDS=240 \
bash scripts/smoke-docker.sh
```

## Nettoyage

```bash
docker compose --env-file .env.docker -f docker-compose.yml down
```

Pour supprimer aussi les volumes :

```bash
docker compose --env-file .env.docker -f docker-compose.yml down -v
```
