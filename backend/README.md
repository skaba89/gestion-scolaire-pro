# SchoolFlow Pro - Backend API

Backend FastAPI pour SchoolFlow Pro - Architecture souveraine

## Stack Technique

- **Framework**: FastAPI 0.110+
- **ORM**: SQLAlchemy 2.0
- **Migrations**: Alembic
- **Auth**: Native JWT (HS256)
- **Cache**: Redis
- **Storage**: MinIO (S3-compatible)
- **Database**: PostgreSQL 16

## Structure du Projet

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py          # Dépendances (DB, auth, etc.)
│   │   └── v1/
│   │       ├── router.py
│   │       └── endpoints/
│   │           ├── auth.py
│   │           ├── students.py
│   │           ├── grades.py
│   │           └── ...
│   ├── core/
│   │   ├── config.py        # Configuration (Pydantic Settings)
│   │   ├── security.py      # JWT, permissions
│   │   └── database.py      # DB connection
│   ├── models/              # SQLAlchemy models
│   ├── schemas/             # Pydantic schemas
│   ├── crud/                # CRUD operations
│   └── main.py              # Application entry point
├── tests/
├── alembic/                 # Database migrations
├── requirements.txt
└── Dockerfile
```

## Installation

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration

Créer un fichier `.env` :

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/schoolflow
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key-at-least-32-chars-long
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

## Lancer le serveur

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Documentation API

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/openapi.json

## Tests

```bash
pytest
pytest --cov=app tests/
```

## Migrations

```bash
# Créer une migration
alembic revision --autogenerate -m "Description"

# Appliquer les migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```
