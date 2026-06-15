# Runbook — Variables Docker locales

## Règle principale

Le fichier `.env.docker.example` est un modèle. Le fichier `.env.docker` local ne doit jamais être commité.

## Créer l'environnement local

```bash
cp .env.docker.example .env.docker
```

Puis remplacer toutes les valeurs `CHANGE_ME`.

## Frontend Docker

En Docker, le frontend est servi par Nginx et les appels API passent par le proxy `/api`.

La valeur attendue est donc :

```env
VITE_API_URL=/api
```

Ne pas utiliser `http://localhost:8000` dans le build Docker, car cela contourne Nginx et peut créer des erreurs CORS ou réseau côté navigateur.

## Frontend en mode npm local

Si le frontend est lancé hors Docker avec `npm run dev`, alors l'URL API peut être définie dans un fichier local dédié au mode Vite, par exemple :

```env
VITE_API_URL=http://localhost:8000
```

## Vérification rapide

```bash
docker compose --env-file .env.docker -f docker-compose.yml config
bash scripts/smoke-docker.sh
```
