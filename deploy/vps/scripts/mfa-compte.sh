#!/usr/bin/env bash
# Secours MFA (« break-glass ») d'un compte, en direct en base via le rôle
# migrateur — pour quand l'application ne peut pas servir : téléphone perdu
# d'un SUPER_ADMIN sans code de secours, par exemple. En temps normal, la MFA
# s'active depuis « Mon profil » dans l'application.
# Le secret n'est affiché que dans CE terminal.
# Usage : ./deploy/vps/scripts/mfa-compte.sh activer|desactiver <email>
set -euo pipefail
cd "$(dirname "$0")/../../.."
MODE="${1:-}"; EMAIL="${2:-}"
[ -n "$EMAIL" ] || { echo "Usage : $0 activer|desactiver <email>"; exit 1; }
C="sudo docker compose --env-file .env.docker -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml"

py() {  # py <étape> [code] — exécute une étape dans le conteneur api (rôle migrateur)
  $C exec -T -e STEP="$1" -e EMAIL="$EMAIL" -e CODE="${2:-}" api python - 2>/dev/null <<'PY'
import os, sys, uuid, pyotp
from sqlalchemy import create_engine, text
from app.api.v1.endpoints.core.mfa import TOTP_ISSUER
eng = create_engine(os.environ["DATABASE_URL_MIGRATIONS"])
step, email = os.environ["STEP"], os.environ["EMAIL"].lower()
with eng.begin() as db:
    u = db.execute(text("SELECT id, tenant_id FROM users WHERE lower(email) = :e"), {"e": email}).fetchone()
    if not u: sys.exit("ERREUR: utilisateur introuvable")
    if step == "enroll":
        secret = pyotp.random_base32()
        db.execute(text("""INSERT INTO mfa_totp_secrets (id, user_id, secret, verified, created_at)
                           VALUES (:id, :uid, :s, FALSE, NOW())
                           ON CONFLICT (user_id) DO UPDATE SET secret = :s, verified = FALSE, created_at = NOW()"""),
                   {"id": str(uuid.uuid4()), "uid": u.id, "s": secret})
        db.execute(text("UPDATE users SET mfa_enabled = FALSE WHERE id = :uid"), {"uid": u.id})
        print(pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=TOTP_ISSUER)); print(secret)
    elif step == "verify":
        row = db.execute(text("SELECT secret FROM mfa_totp_secrets WHERE user_id = :uid"), {"uid": u.id}).fetchone()
        if not row or not pyotp.TOTP(row.secret).verify(os.environ["CODE"].strip(), valid_window=1):
            sys.exit("ERREUR: code invalide")
        db.execute(text("UPDATE mfa_totp_secrets SET verified = TRUE WHERE user_id = :uid"), {"uid": u.id})
        n = db.execute(text("UPDATE users SET mfa_enabled = TRUE WHERE id = :uid"), {"uid": u.id}).rowcount
        print(f"OK: MFA activée ({n} compte)")
    elif step == "disable":
        db.execute(text("DELETE FROM mfa_totp_secrets WHERE user_id = :uid"), {"uid": u.id})
        db.execute(text("UPDATE users SET mfa_enabled = FALSE WHERE id = :uid"), {"uid": u.id})
        print("OK: MFA désactivée")
PY
}

case "$MODE" in
  activer)
    out="$(py enroll)"; uri="$(sed -n 1p <<<"$out")"; secret="$(sed -n 2p <<<"$out")"
    echo; echo "Scanne ce QR code avec ton appli d'authentification :"; echo
    qrencode -t ansiutf8 "$uri"
    echo "Saisie manuelle possible — clé : $secret"; echo
    for i in 1 2 3; do
      read -rp "Code à 6 chiffres affiché par l'appli : " code
      if py verify "$code"; then clear; echo "MFA activée pour $EMAIL."; exit 0; fi
    done
    echo "Échec après 3 essais (vérifie l'heure du téléphone). Relance le script."; exit 1 ;;
  desactiver)
    read -rp "Désactiver la MFA de $EMAIL ? (oui/non) " ok; [ "$ok" = oui ] && py disable ;;
  *) echo "Usage : $0 activer|desactiver <email>"; exit 1 ;;
esac
