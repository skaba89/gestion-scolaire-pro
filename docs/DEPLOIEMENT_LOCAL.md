# Déploiement local (Docker)

## Prérequis

- Docker Desktop (Windows/Mac) ou Docker Engine + Compose v2 (Linux)
- 4 Go de RAM disponibles pour les conteneurs

## Démarrage

```bash
# 1. Cloner et configurer
git clone https://github.com/skaba89/gestion-scolaire-pro.git
cd gestion-scolaire-pro
cp .env.docker.example .env.docker

# 2. Éditer .env.docker — remplacer TOUS les CHANGE_ME :
#    POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_ROOT_PASSWORD,
#    SECRET_KEY (openssl rand -hex 32), BOOTSTRAP_SECRET (openssl rand -hex 32),
#    ADMIN_DEFAULT_PASSWORD (min 8 caractères)
#    → reporter le mot de passe PostgreSQL dans DATABASE_URL / _ASYNC / _SYNC

# 3. Lancer
docker compose --env-file .env.docker up -d --build

# 4. Vérifier
docker compose ps                       # tous les services "healthy"
curl http://localhost:8000/health/ready # dépendances prêtes (API directe)
curl http://localhost:8000/health/live  # processus vivant
curl http://localhost:3000              # frontend nginx
```

## Services

| Service | Port hôte (défaut) | Rôle |
|---|---|---|
| frontend | 3000 | Nginx : SPA + proxy `/api/` → api:8000 |
| api | 8000 | FastAPI (gunicorn en prod, uvicorn --reload si DEBUG) |
| postgres | 5432 | PostgreSQL 16 |
| redis | 6379 | Cache |
| minio | 9002 / 9001 | Stockage fichiers (S3) — optionnel |
| pgadmin | 5050 (127.0.0.1) | Admin DB — dev uniquement |
| db-backup | — | Sauvegardes PostgreSQL automatiques |

## Migrations

`backend/start.sh` exécute `alembic upgrade head` **une seule fois** au démarrage
du conteneur api, puis exporte `SCHOOLFLOW_MIGRATIONS_DONE=true` pour que les
workers gunicorn ne relancent pas la migration.

```bash
# Vérifier l'état des migrations
docker compose exec api alembic current
docker compose exec api alembic heads    # doit afficher UN seul head

# Test sur base vierge
docker compose down -v
docker compose --env-file .env.docker up -d postgres redis
docker compose --env-file .env.docker up -d api
docker compose exec api alembic current
```

## Comptes initiaux

- **Super admin** : créé automatiquement au démarrage si `ADMIN_DEFAULT_EMAIL`
  + `ADMIN_DEFAULT_PASSWORD` (≥ 8 caractères) sont définis.
- **Alternative** : endpoint bootstrap (usage unique, refuse si un SUPER_ADMIN existe) :
  ```bash
  curl -X POST http://localhost:8000/api/v1/auth/bootstrap/ \
    -H "Content-Type: application/json" \
    -d '{"bootstrap_key": "<BOOTSTRAP_SECRET>", "new_password": "MotDePasse@Fort1"}'
  ```

## Dev local hors Docker

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (port 3000)
npm install --legacy-peer-deps
npm run dev
```

## Erreurs fréquentes

| Symptôme | Cause | Solution |
|---|---|---|
| api unhealthy au 1er lancement | migrations longues | attendre `start_period` (60s), voir `docker compose logs api` |
| ERR_CONNECTION_REFUSED sur /api | frontend construit avec mauvais VITE_API_URL | compose force `/api` au build — reconstruire : `docker compose build frontend` |
| 400 "Tenant ID not found" | JWT sans tenant_id | se déconnecter/reconnecter ; le header X-Tenant-ID sert de fallback |
| Bootstrap 403 | SUPER_ADMIN existe déjà | comportement normal (usage unique) |
| Vieux JS servi après rebuild | cache Service Worker | Ctrl+Shift+R ; les caches sont versionnés (v4) |
