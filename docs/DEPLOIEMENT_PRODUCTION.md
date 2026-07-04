# Déploiement production

Deux cibles supportées : **Render + Netlify** (SaaS géré) ou **VPS Docker**
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

## Option A — Render (API) + Netlify (frontend)

1. **API sur Render** : service Docker ou Python
   - Start command : `bash start.sh` (exécute alembic upgrade head UNE fois puis gunicorn)
   - Healthcheck : `/health/`
   - `DEBUG=False` (désactive /docs et le mode reload)
2. **Frontend sur Netlify**
   - Build : `npm run build` (avec `--legacy-peer-deps` à l'install)
   - `VITE_API_URL` = URL publique de l'API Render, **ou** runtime config :
     éditer `dist/config.js` → `window.__SCHOOLFLOW_CONFIG__ = { API_URL: "https://api.exemple.com" }`
   - Redirection SPA : `/* → /index.html 200`

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
- [ ] `curl https://api.../health/` → `{"status":"healthy", ...}`
- [ ] Login super-admin OK, création tenant OK, login tenant admin OK
- [ ] CORS : uniquement les domaines de production (jamais `*`)
- [ ] Sauvegardes testées (restaurer un dump sur une base vierge)
- [ ] Sentry configuré (SENTRY_DSN) pour le suivi des erreurs
- [ ] Emails sortants testés (RESEND_API_KEY ou SMTP)

## Rollback

- **Code** : redéployer le tag/commit précédent (les migrations sont additives ;
  ne jamais faire `alembic downgrade` en production sans dump préalable).
- **Base** : restaurer le dernier dump du service db-backup.
