#!/usr/bin/env bash
# Mise à jour de la production VPS : pull → build → migrations (rôle migrateur) → redémarrage.
# Usage (depuis n'importe où) : ./deploy/vps/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
C="sudo docker compose --env-file .env.docker -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml"
git pull --ff-only
$C build --build-arg RELEASE_SHA="$(git rev-parse --short HEAD)"
$C up -d --wait postgres redis minio
$C run --rm --no-deps api alembic upgrade head
$C up -d --wait

# Cache de build Docker : il grossit à chaque déploiement (≈ 14 Go en un jour
# sur ce VPS). On ne garde que les 7 derniers jours ; ni images, ni
# conteneurs, ni volumes ne sont touchés.
sudo docker builder prune -f --filter until=168h >/dev/null

# Contrôle de bout en bout (Caddy → nginx → API) sur le vrai domaine, résolu
# localement : un simple `curl http://localhost` n'atteint aucun site Caddy
# (réponse vide, que curl -f considère pourtant comme un succès).
DOMAIN="$($C exec -T caddy printenv VPS_DOMAIN)"
curl -fsS --retry 5 --retry-delay 3 --retry-all-errors \
  --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/health/ready" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["status"], d.get("release_sha")); sys.exit(d["status"] != "healthy")'
