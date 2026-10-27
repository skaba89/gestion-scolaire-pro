#!/usr/bin/env bash
# Copie chiffrée des dumps PostgreSQL vers le stockage distant (Backblaze B2,
# remote rclone "distant-crypt"), lancée chaque nuit par cron en root
# (voir deploy/vps/schoolflow-offsite.cron).
#
# Le journal se termine par « === <date> OK » seulement si TOUT a réussi :
# surveillance.py s'en sert pour l'alerte « distant ».
set -uo pipefail
SRC="${BACKUP_SRC:-$(cd "$(dirname "$0")/../../.." && pwd)/infra/backups}"
LOG="${OFFSITE_LOG:-/var/log/schoolflow-offsite.log}"
# Tant que configurer-sauvegarde-b2.sh n'a pas créé le remote, ne rien faire.
rclone listremotes 2>/dev/null | grep -qx "distant-crypt:" || exit 0
{
  echo "=== $(date -Is) début"
  failed=0
  # Dumps quotidiens : un nom par jour, jamais réécrit — --immutable refuse
  # qu'une copie distante déjà présente soit écrasée par un fichier différent.
  rclone copy "$SRC/daily" "distant-crypt:daily" --copy-links --immutable --exclude "*-latest.*" || failed=1
  # Semaine / mois EN COURS : le conteneur de sauvegarde les fait pointer
  # chaque nuit vers le dernier dump (incident 2026-10-25 : --immutable les
  # refusait et toute la copie échouait). Ils doivent pouvoir être remplacés.
  for d in weekly monthly; do
    rclone copy "$SRC/$d" "distant-crypt:$d" --copy-links --exclude "*-latest.*" || failed=1
  done
  # Rétention distante : 200 jours (couvre les 6 mois de dumps mensuels).
  rclone delete "distant-crypt:" --min-age 200d || failed=1
  if [ "$failed" -eq 0 ]; then
    echo "=== $(date -Is) OK"
  else
    echo "=== $(date -Is) ÉCHEC"
  fi
} >>"$LOG" 2>&1
grep -q " OK$" <(tail -n 1 "$LOG")
