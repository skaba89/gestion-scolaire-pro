# Déploiement production

Deux cibles supportées : **Render + Neon** (SaaS géré) ou **VPS Docker**
(souveraineté des données — recommandé pour les contrats institutionnels guinéens).

## Variables d'environnement obligatoires

| Variable | Rôle | Génération |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 16 | fourni par l'hébergeur |
| `SECRET_KEY` | signature JWT (≥ 32 chars) | `openssl rand -hex 32` |
| `BOOTSTRAP_SECRET` | endpoint bootstrap super-admin | `openssl rand -hex 32` |
| `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD` | super-admin initial (≥ 8 chars) | — |
| `BACKEND_CORS_ORIGINS` | domaine(s) frontend, séparés par virgules | — |
| `FRONTEND_URL` | liens dans les emails | — |

Optionnelles : `REDIS_URL`, `MINIO_*`, `GROQ_API_KEY`, `SENTRY_DSN`,
`RESEND_API_KEY`/`SMTP_*` (emails), `STRIPE_*` (paiement carte).

Voir `.env.production.template` pour la liste complète.

## Option A — Render (API + frontend) + Neon (base de données)

Le dépôt contient un `render.yaml` prêt à l'emploi (déploiement en un clic via
**Render Blueprints**). Il définit deux services Render (API + frontend) mais
ne provisionne PAS de base de données — Neon est externe et se configure à la
main. Pourquoi Neon plutôt que le PostgreSQL managé de Render : le tier
gratuit Neon n'expire pas après 90 jours (contrairement à celui de Render) et
propose le branching de base, pratique pour tester une migration sur une
copie des données de prod.

### 1. Créer la base sur Neon

1. Créer un compte sur [neon.tech](https://neon.tech) et un projet (région la
   plus proche de `frankfurt`, pour minimiser la latence avec Render).
2. Dans **Connection Details**, copier la chaîne de connexion **pooled**
   (celle dont l'hôte contient `-pooler`) — c'est celle qu'il faut utiliser
   pour l'API en production afin de ne pas épuiser la limite de connexions
   directes de Neon sous charge.
3. Vérifier qu'elle contient bien `?sslmode=require` (c'est le cas par
   défaut) — le backend le détecte automatiquement, aucune config
   supplémentaire n'est nécessaire (`backend/app/core/database.py`).

### 2. Déployer sur Render

1. `render blueprint apply` (ou "New Blueprint" dans le dashboard Render,
   en pointant vers ce dépôt) — crée les deux services `schoolflow-api` et
   `gestion-scolaire-pro` définis dans `render.yaml`.
2. Sur le service **schoolflow-api**, dans l'onglet Environment, coller la
   chaîne de connexion Neon (étape 1) dans les trois variables
   `DATABASE_URL`, `DATABASE_URL_ASYNC`, `DATABASE_URL_SYNC` — elles sont
   marquées `sync: false` dans le blueprint, donc Render ne les demande pas
   automatiquement au déploiement, il faut les renseigner à la main.
3. Les migrations Alembic s'exécutent automatiquement au démarrage de l'API
   (lifespan handler dans `main.py`) — pas d'étape manuelle.
4. Readiness : `/health/ready` · Liveness : `/health/live` · `DEBUG=false`
   (déjà positionné dans le blueprint, désactive `/docs` et le mode reload).
5. Le frontend (service `gestion-scolaire-pro`, Node + `server.mjs`) proxy
   `/api/*` vers l'API — un seul domaine côté navigateur, aucun problème CORS.
   `VITE_API_URL` est résolu automatiquement par Render (`fromService`).

## Option B — VPS Docker (recommandé Guinée)

```bash
cp .env.docker.example .env.docker   # remplir TOUS les CHANGE_ME
docker compose --env-file .env.docker up -d --build
```

- Mettre un reverse-proxy TLS devant le port frontend (Caddy ou Traefik ;
  Caddy = TLS automatique Let's Encrypt).
- `DEBUG=False` dans .env.docker (le compose le force à true pour le dev local —
  créer un `docker-compose.prod.yml` qui l'écrase si besoin).
- Sauvegardes : le service `db-backup` produit des dumps quotidiens ;
  externaliser le dossier de backups (rclone vers un stockage distant).

## Checklist avant mise en production

- [ ] Tous les `CHANGE_ME` remplacés ; secrets ≥ 32 caractères
- [ ] `DEBUG=False` (vérifier que `/docs` renvoie 404)
- [ ] `alembic heads` → un seul head ; `alembic current` == head
- [ ] `curl https://api.../health/ready` → `{"status":"healthy", ...}`
- [ ] `curl https://api.../health/live` → `{"status":"alive", ...}`
- [ ] Login super-admin OK, création tenant OK, login tenant admin OK
- [ ] CORS : uniquement les domaines de production (jamais `*`)
- [ ] Sauvegardes testées (restaurer un dump sur une base vierge)
- [ ] Sentry configuré (SENTRY_DSN) pour le suivi des erreurs
- [ ] Emails sortants testés (RESEND_API_KEY ou SMTP)

## Rollback

- **Code** : redéployer le tag/commit précédent (les migrations sont additives ;
  ne jamais faire `alembic downgrade` en production sans dump préalable).
- **Base** : restaurer le dernier dump du service db-backup.
