#!/usr/bin/env bash
# Copie chiffrée des dumps PostgreSQL vers le stockage distant (Backblaze B2,
# remote rclone "distant-crypt"), lancée chaque nuit par cron en root
# (voir deploy/vps/schoolflow-offsite.cron).
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../../.." && pwd)/infra/backups"
LOG=/var/log/schoolflow-offsite.log
# Tant que configurer-sauvegarde-b2.sh n'a pas créé le remote, ne rien faire.
rclone listremotes 2>/dev/null | grep -qx "distant-crypt:" || exit 0
{
  echo "=== $(date -Is) début"
  for d in daily weekly monthly; do
    # *-latest.* est un lien remplacé chaque jour : --immutable le refuserait.
    rclone copy "$SRC/$d" "distant-crypt:$d" --copy-links --immutable --exclude "*-latest.*"
  done
  # Rétention distante : 200 jours (couvre les 6 mois de dumps mensuels).
  rclone delete "distant-crypt:" --min-age 200d
  echo "=== $(date -Is) OK"
} >>"$LOG" 2>&1
