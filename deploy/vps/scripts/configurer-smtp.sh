#!/usr/bin/env bash
# Saisie interactive des identifiants SMTP Gmail dans .env.docker (rien n'est
# affiché ni gardé dans l'historique). Puis : ./deploy/vps/deploy.sh
# Usage : sudo ./deploy/vps/scripts/configurer-smtp.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Lancer avec sudo."; exit 1; }
cd "$(dirname "$0")/../../.."
ENV=.env.docker

set_kv() {  # set_kv CLE VALEUR — remplace ou ajoute dans .env.docker
  python3 - "$ENV" "$1" "$2" <<'PY'
import sys, re, pathlib
p, k, v = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
t = p.read_text()
if re.search(rf"^{k}=", t, re.M): t = re.sub(rf"^{k}=.*$", lambda m: f"{k}={v}", t, flags=re.M)
else: t = t.rstrip("\n") + f"\n{k}={v}\n"
p.write_text(t)
PY
}

read -rp "Adresse Gmail d'envoi : " GMAIL
[ -n "$GMAIL" ] || { echo "Adresse vide, abandon."; exit 1; }
read -rsp "Mot de passe d'application Google (16 lettres, espaces acceptés) : " GPASS; echo
GPASS="${GPASS// /}"
[ "${#GPASS}" -eq 16 ] || { echo "Le mot de passe d'application doit faire 16 lettres, abandon."; exit 1; }
set_kv SMTP_HOST smtp.gmail.com
set_kv SMTP_PORT 587
set_kv SMTP_USER "$GMAIL"
set_kv SMTP_PASS "$GPASS"
set_kv FROM_EMAIL "$GMAIL"
set_kv FROM_NAME "Academy Guinéenne"
echo "-> SMTP enregistré dans $ENV (appliqué au prochain ./deploy/vps/deploy.sh)"
