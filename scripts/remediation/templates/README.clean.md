# SchoolFlow Pro - Édition Institutionnelle

SchoolFlow Pro est une plateforme de gestion scolaire moderne conçue pour les établissements privés, publics et institutionnels, avec une architecture orientée sécurité, multi-tenant et exploitation locale ou cloud.

## Objectifs du projet

Le produit vise à fournir une base robuste pour :
- la gestion des élèves, enseignants, parents et classes ;
- la gestion académique (présences, notes, emplois du temps, examens) ;
- la communication interne et les notifications ;
- l’administration multi-établissements ;
- l’observabilité, l’audit et la conformité.

## Stack technique

### Frontend
- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- Redis
- MinIO

### Authentification et sécurité
- Keycloak / OIDC
- isolation multi-tenant
- audit et journalisation
- préparation à la conformité RGPD

## Démarrage rapide

### Prérequis
- Docker
- Node.js 20
- Python 3.11

### 1. Initialiser les variables d’environnement
Copier les templates :

```bash
cp .env.example .env
cp .env.docker.example .env.docker
```

### 2. Démarrer l’infrastructure locale
```bash
docker compose --env-file .env.docker up -d
```

### 3. Lancer le frontend
```bash
npm install
npm run dev
```

### 4. Lancer le backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Services locaux

Par défaut :
- Frontend : `http://localhost:3000`
- API : `http://localhost:8000`
- Keycloak : `http://localhost:8080`
- PgAdmin : `http://localhost:5050`
- MinIO Console : `http://localhost:9001`

## Industrialisation

Le dépôt inclut une base d’industrialisation avec :
- CI GitHub
- scripts de vérification
- préparation de release propre
- conventions de dépôt et d’environnement

## État actuel

Le projet est en phase de stabilisation avancée pour devenir une base production-ready, avec priorité sur :
- nettoyage du dépôt ;
- cohérence frontend/backend ;
- fiabilisation de la CI ;
- durcissement sécurité et multi-tenant ;
- préparation d’une version démontrable et vendable.

## Licence

Projet propriétaire.
