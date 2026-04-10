# SchoolFlow Pro — Docker Self-Hosting Guide

## Prerequisites

- Docker & Docker Compose (v2+)
- At least 4 GB RAM available
- Git

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd gestion-scolaire-pro
```

### 2. Configure environment variables

```bash
cp .env.docker.example .env.docker
```

Edit `.env.docker` and set at minimum the **required** values:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Strong password for PostgreSQL |
| `MINIO_ROOT_PASSWORD` | MinIO root password (min 8 chars) |
| `SECRET_KEY` | Backend secret key (generate with `openssl rand -hex 32`) |
| `PGADMIN_PASSWORD` | pgAdmin login password |

### 3. Start all services

```bash
docker compose --env-file .env.docker up -d --build
```

Wait ~30 seconds for PostgreSQL and Redis to become healthy before the API starts.

### 4. Run database migrations

```bash
docker compose --env-file .env.docker exec api alembic upgrade head
```

## Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| **Frontend** | http://localhost:3000 | React SPA (Vite) |
| **API** | http://localhost:8000 | FastAPI backend + Swagger docs |
| **PostgreSQL** | localhost:5432 | Primary database |
| **Redis** | localhost:6379 | Cache & session store |
| **MinIO Console** | http://localhost:9001 | S3-compatible object storage UI |
| **MinIO API** | localhost:9002 | S3-compatible object storage API |
| **pgAdmin** | http://localhost:5050 | Database management UI |

## Architecture

```
                    ┌─────────────┐
                    │  Frontend   │  :3000
                    │  (nginx)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │     API     │  :8000
                    │  (FastAPI)  │
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────┐
        ┌─────▼─────┐ ┌───▼───┐ ┌──────▼──────┐
        │ PostgreSQL│ │ Redis │ │    MinIO    │
        │   :5432   │ │ :6379 │ │ :9002/:9001 │
        └───────────┘ └───────┘ └─────────────┘

        ┌───────────┐
        │  pgAdmin  │  :5050
        └───────────┘
```

## Useful Commands

```bash
# View all logs
docker compose logs -f

# Logs for a specific service
docker compose logs -f api
docker compose logs -f frontend

# Restart a service
docker compose restart api

# Stop everything
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v

# Rebuild a single service
docker compose build api
docker compose up -d api

# Access PostgreSQL shell
docker compose exec postgres psql -U schoolflow -d schoolflow

# Access Redis CLI
docker compose exec redis redis-cli
```

## Environment Variables Reference

### Required

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | _(none)_ | PostgreSQL password |
| `MINIO_ROOT_PASSWORD` | _(none)_ | MinIO root password |
| `SECRET_KEY` | _(none)_ | FastAPI secret key |
| `PGADMIN_PASSWORD` | _(none)_ | pgAdmin login password |

### Optional (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | `schoolflow` | Database name |
| `POSTGRES_USER` | `schoolflow` | Database user |
| `POSTGRES_PORT` | `5432` | PostgreSQL exposed port |
| `REDIS_PORT` | `6379` | Redis exposed port |
| `MINIO_ROOT_USER` | `minioadmin` | MinIO root username |
| `MINIO_BUCKET` | `schoolflow` | Default MinIO bucket |
| `MINIO_API_PORT` | `9002` | MinIO API exposed port |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO Console exposed port |
| `API_PORT` | `8000` | Backend API exposed port |
| `FRONTEND_PORT` | `3000` | Frontend exposed port |
| `PGADMIN_EMAIL` | `admin@schoolflow.com` | pgAdmin login email |
| `PGADMIN_PORT` | `5050` | pgAdmin exposed port |
| `VITE_API_URL` | `http://localhost:8000` | API URL for frontend |
| `DEBUG` | `False` | Enable debug mode |
| `LOG_LEVEL` | `INFO` | Logging verbosity |
| `BACKEND_CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |
| `BACKUP_SCHEDULE` | `@daily` | Database backup cron |
| `BACKUP_KEEP_DAYS` | `7` | Daily backups to keep |
| `BACKUP_KEEP_WEEKS` | `4` | Weekly backups to keep |
| `BACKUP_KEEP_MONTHS` | `6` | Monthly backups to keep |

## Database Backups

Automatic daily backups are configured via the `db-backup` service. Backup files are stored in `./infra/backups/`.

## MinIO Setup

On first launch, create the default bucket:

```bash
docker compose exec minio mc alias set local http://localhost:9000 minioadmin <MINIO_ROOT_PASSWORD>
docker compose exec minio mc mb local/schoolflow
```

## Production Security Checklist

1. Change all default passwords in `.env.docker`
2. Set `DEBUG=False` and `LOG_LEVEL=WARNING`
3. Use HTTPS via a reverse proxy (nginx/Traefik)
4. Restrict exposed ports (only 80/443 externally)
5. Configure a firewall
6. Enable database backups
7. Rotate `SECRET_KEY` regularly
