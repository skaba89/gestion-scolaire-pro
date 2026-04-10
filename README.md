# SchoolFlow Pro — Plateforme de Gestion Scolaire

> Plateforme de gestion scolaire moderne, multi-tenant, conçue pour les établissements privés, publics et institutionnels. Architecture sécurisée, exploitation locale ou cloud.

---

## Table des matières

1. [Stack technique](#stack-technique)
2. [Prérequis](#prérequis)
3. [Démarrage rapide (Docker)](#démarrage-rapide-docker)
4. [Démarrage rapide (développement local)](#démarrage-rapide-développement-local)
5. [Premier compte administrateur](#premier-compte-administrateur)
6. [Connexion](#connexion)
7. [Services locaux](#services-locaux)
8. [Architecture](#architecture)
9. [Authentification](#authentification)
10. [Rôles et permissions](#rôles-et-permissions)
11. [Déploiement cloud (Render)](#déploiement-cloud-render)
12. [Structure du projet](#structure-du-projet)
13. [Scripts utilitaires](#scripts-utilitaires)
14. [CI/CD](#cicd)

---

## Stack technique

| Composant | Technologie |
|-----------|------------|
| **Frontend** | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| **Backend** | FastAPI (Python 3.11) + SQLAlchemy ORM + Alembic |
| **Base de données** | PostgreSQL 16 |
| **Cache** | Redis 7 |
| **Stockage** | MinIO (S3-compatible) |
| **Authentification** | JWT natif (HS256) — aucun fournisseur externe |
| **State management** | Zustand + React Context |
| **i18n** | react-i18next (5 langues : FR, EN, ES, AR, ZH) |
| **Mobile** | Capacitor (iOS/Android) |
| **Monitoring** | Prometheus + Sentry |

---

## Prérequis

- **Docker** + Docker Compose v2+
- **Node.js** 20 (voir `.nvmrc`)
- **Python** 3.11+
- **Git**

---

## Démarrage rapide (Docker)

### 1. Cloner le dépôt

```bash
git clone https://github.com/skaba89/gestion-scolaire-pro.git
cd gestion-scolaire-pro
```

### 2. Configurer les variables d'environnement

```bash
cp .env.docker.example .env.docker
```

Modifier `.env.docker` et définir au minimum :

```ini
# Généré avec : openssl rand -hex 32
SECRET_KEY=<votre_clé_secrète_64_caractères>

# Mots de passe forts
POSTGRES_PASSWORD=<mot_de_passe_postgres>
MINIO_ROOT_PASSWORD=<mot_de_passe_minio_8_car_min>
PGADMIN_PASSWORD=<mot_de_passe_pgadmin>
```

### 3. Lancer tous les services

```bash
docker compose --env-file .env.docker up -d
```

Cela démarre : PostgreSQL, Redis, MinIO, l'API, le frontend, PgAdmin et le service de sauvegarde.

### 4. Appliquer les migrations de base de données

```bash
docker compose exec api alembic upgrade head
```

### 5. Créer le compte administrateur

```bash
docker compose exec api python -m app.scripts.create_admin
```

Cela crée automatiquement :
- Un tenant par défaut (`Default School`, slug `default`)
- Un utilisateur SUPER_ADMIN (`admin@schoolflow.local` / `Admin@123456`)

### 6. Accéder à l'application

- **Frontend** : http://localhost:3000
- **Page de connexion** : http://localhost:3000/auth
- **API Swagger** : http://localhost:8000/docs
- **PgAdmin** : http://localhost:5050
- **MinIO Console** : http://localhost:9001

---

## Démarrage rapide (développement local)

### 1. Lancer l'infrastructure uniquement

```bash
docker compose --env-file .env.docker up -d postgres redis minio
```

### 2. Configurer le backend

```bash
cp .env.example .env
# Adapter .env avec vos paramètres locaux
```

### 3. Installer et lancer le backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate sur Windows
pip install -r requirements.txt
alembic upgrade head
python -m app.scripts.create_admin
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Installer et lancer le frontend

```bash
# Dans un nouveau terminal
npm install
npm run dev
```

Le frontend est accessible sur http://localhost:5173 (port Vite par défaut).

---

## Premier compte administrateur

Le script `create_admin` crée automatiquement un compte SUPER_ADMIN si aucun n'existe.

**Identifiants par défaut :**

| Champ | Valeur |
|-------|--------|
| Email | `admin@schoolflow.local` |
| Mot de passe | `Admin@123456` |
| Rôle | SUPER_ADMIN |
| Tenant | Default School (`default`) |

> ⚠️ **Important** : Changez ce mot de passe immédiatement après la première connexion.

### Créer un admin personnalisé

```bash
# Modifier les constantes dans backend/app/scripts/create_admin.py
# Puis relancer :
cd backend
python -m app.scripts.create_admin
```

---

## Connexion

1. Accédez à http://localhost:3000/auth
2. Entrez l'email : `admin@schoolflow.local`
3. Entrez le mot de passe : `Admin@123456`
4. Cliquez sur "Se connecter"
5. Vous êtes redirigé vers le tableau de bord admin

---

## Services locaux

| Service | URL | Description |
|---------|-----|-------------|
| Frontend (dev) | http://localhost:5173 | Vite dev server |
| Frontend (Docker) | http://localhost:3000 | Nginx |
| API | http://localhost:8000 | FastAPI |
| API Docs (Swagger) | http://localhost:8000/docs | Documentation interactive |
| API Docs (ReDoc) | http://localhost:8000/redoc | Documentation ReDoc |
| PgAdmin | http://localhost:5050 | Administration PostgreSQL |
| MinIO Console | http://localhost:9001 | Console de gestion MinIO |
| MinIO API | http://localhost:9002 | API S3-compatible |

---

## Architecture

```
┌──────────────────┐     ┌───────────────────┐     ┌──────────────┐
│    Frontend       │────▶│   FastAPI API      │────▶│  PostgreSQL  │
│  React + Vite     │     │   (Port 8000)      │     │  (Port 5432) │
└──────────────────┘     └────────┬──────────┘     └──────────────┘
                                  │                 ┌──────────────┐
                                  ├────────────────▶│    Redis     │
                                  │                 │  (Port 6379) │
                                  │                 └──────────────┘
                                  │                 ┌──────────────┐
                                  └────────────────▶│    MinIO     │
                                                    │ (Port 9000)  │
                                                    └──────────────┘
```

L'authentification est **100% JWT natif** signée avec HS256. Aucun service d'identité externe (Keycloak, OIDC, OAuth) n'est requis.

### Flux d'authentification

1. L'utilisateur envoie email + mot de passe à `POST /api/v1/auth/login/`
2. Le backend vérifie les identifiants (bcrypt) et retourne un JWT
3. Le JWT contient : `sub` (user_id), `email`, `roles`, `tenant_id`
4. Le frontend stocke le token et l'envoie dans le header `Authorization: Bearer`
5. Le token expire après 30 min (configurable) et est rafraîchi automatiquement

---

## Rôles et permissions

| Rôle | Permissions |
|------|-------------|
| **SUPER_ADMIN** | Accès total (`*`) |
| **TENANT_ADMIN** | Accès total au tenant (`*`) |
| **DIRECTOR** | Lecture/écriture élèves, notes, présences, analytics |
| **TEACHER** | Lecture/écriture notes, présences |
| **STUDENT** | Lecture de ses propres notes et présences |
| **PARENT** | Lecture des notes et présences de ses enfants |
| **ALUMNI** | Lecture de son propre profil |
| **STAFF** | Lecture élèves et présences |
| **ACCOUNTANT** | Lecture/écriture finances, lecture élèves |
| **DEPARTMENT_HEAD** | Gestion du département |

---

## Déploiement cloud (Render)

Le fichier `render.yaml` contient la configuration complète pour Render.com :

- `schoolflow-frontend` : service Docker (port 10000)
- `schoolflow-api` : service Python 3.11
- `schoolflow-minio` : service Docker (stockage S3)
- `schoolflow-redis` : Redis managé
- `schoolflow-db` : PostgreSQL 16 managé

---

## Structure du projet

```
gestion-scolaire-pro/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/     # Routes API (auth, users, tenants, etc.)
│   │   ├── core/                 # Config, database, security, middleware
│   │   ├── models/               # SQLAlchemy ORM (35 modèles)
│   │   ├── schemas/              # Pydantic schemas
│   │   ├── crud/                 # Helpers de requêtes
│   │   ├── middlewares/           # Tenant, metrics, quota
│   │   └── services/             # WebSocket, realtime
│   ├── alembic/                  # Migrations de base de données
│   ├── scripts/                  # Scripts utilitaires (create_admin, seed)
│   └── tests/                    # Tests unitaires
├── src/                          # Frontend React
│   ├── api/                      # Client HTTP (Axios)
│   ├── contexts/                 # React Context (Auth, Tenant, Theme)
│   ├── stores/                   # Zustand stores
│   ├── pages/                    # Pages (~95 fichiers)
│   ├── components/               # Composants (~300+ fichiers)
│   ├── hooks/                    # Hooks personnalisés (~45)
│   ├── routes/                   # Configuration des routes
│   ├── lib/                      # Utilitaires, types, i18n
│   └── queries/                  # TanStack Query hooks
├── docker/                       # Configs Docker (nginx, entrypoint)
├── scripts/                      # Scripts système (backup, verify)
├── infra/                        # Fichiers d'infrastructure (backups)
├── docs/                         # Documentation projet
├── tests/                        # Tests E2E
├── docker-compose.yml            # Services Docker locaux
├── Dockerfile                    # Build frontend Docker
├── Dockerfile.render             # Build frontend Render
├── render.yaml                   # Config Render.com
├── .github/workflows/ci.yml      # CI GitHub Actions
├── Makefile                      # Commandes de développement
└── package.json                  # Dépendances frontend
```

---

## Scripts utilitaires

| Commande | Description |
|----------|-------------|
| `make verify` | Vérifications du projet (fichiers, node_modules, etc.) |
| `make frontend` | Lint, type-check, tests et build frontend |
| `make backend` | Installation et tests backend |
| `cd backend && python -m app.scripts.create_admin` | Crée le compte SUPER_ADMIN |
| `cd backend && python -m app.scripts.seed_demo_tenants` | Initialise des données de démo |

---

## CI/CD

Le pipeline CI (`GitHub Actions`) s'exécute sur chaque push et PR :

1. **Preflight** : Détection de marqueurs de fusion
2. **Frontend** : Lint ESLint, type-check, tests unitaires, build
3. **Backend** : Tests pytest avec PostgreSQL conteneurisé
4. **Docker** : Validation docker-compose et build des images

---

## Licence

Projet propriétaire — SchoolFlow Pro © 2024-2026
