#!/bin/sh
# Frontend Azure App Service — démarrage (voir Dockerfile.appservice).
#
# Génère, à partir de variables d'environnement VALIDÉES :
#   - /tmp/nginx-appservice/site.conf             (port d'écoute, révision)
#   - /tmp/nginx-appservice/security-headers.conf (CSP connect-src)
#   - /usr/share/nginx/html/config.js             (URL de l'API pour le navigateur)
# puis lance nginx au premier plan.
#
# Échec explicite (code 1, message sur stderr) si une valeur manque ou est
# invalide : jamais de valeur par défaut silencieuse pour l'URL de l'API.
#
# Variables :
#   PORT                 port d'écoute (défaut 10000 ; 1024-65535, processus non-root)
#   SCHOOLFLOW_API_URL   origine HTTPS de l'API, ex. https://api.example.org
#   VITE_API_URL         repli pour SCHOOLFLOW_API_URL (nom déjà utilisé par les App Settings)
#   CSP_CONNECT_SRC      origines supplémentaires pour connect-src (facultatif, séparées par des espaces)
set -eu

fail() {
    echo "[entrypoint] ERREUR : $*" >&2
    exit 1
}

TEMPLATES=/etc/nginx/appservice
OUT=/tmp/nginx-appservice
HTML=/usr/share/nginx/html

PORT="${PORT:-10000}"
case "$PORT" in
    ''|*[!0-9]*) fail "PORT invalide (entier attendu)." ;;
esac
if [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
    fail "PORT hors de la plage 1024-65535 (le processus ne tourne pas en root)."
fi

API_URL="${SCHOOLFLOW_API_URL:-${VITE_API_URL:-}}"
API_URL="${API_URL%/}"
[ -n "$API_URL" ] || fail "SCHOOLFLOW_API_URL (ou VITE_API_URL) est obligatoire : origine HTTPS de l'API."
# Origine HTTPS seule (pas de chemin, pas de guillemets) : la valeur est
# écrite dans config.js et dans l'en-tête CSP.
if ! printf '%s' "$API_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
    fail "URL de l'API invalide : origine https://hôte[:port] attendue, sans chemin."
fi

EXTRA_CONNECT="${CSP_CONNECT_SRC:-}"
if [ -n "$EXTRA_CONNECT" ]; then
    for src in $EXTRA_CONNECT; do
        printf '%s' "$src" | grep -Eq '^(https|wss)://[A-Za-z0-9*.-]+(:[0-9]{1,5})?$' \
            || fail "CSP_CONNECT_SRC invalide : origines https:// ou wss:// séparées par des espaces."
    done
fi
CONNECT_SRC="$API_URL"
for src in $EXTRA_CONNECT; do
    [ "$src" = "$API_URL" ] || CONNECT_SRC="$CONNECT_SRC $src"
done

RELEASE_SHA="${RELEASE_SHA:-unknown}"
printf '%s' "$RELEASE_SHA" | grep -Eq '^([0-9a-f]{40}|unknown)$' || fail "RELEASE_SHA invalide."

mkdir -p "$OUT"
sed -e "s|__PORT__|$PORT|g" -e "s|__RELEASE_SHA__|$RELEASE_SHA|g" \
    "$TEMPLATES/site.conf.template" > "$OUT/site.conf"
sed -e "s|__CONNECT_SRC__|$CONNECT_SRC|g" \
    "$TEMPLATES/security-headers.conf.template" > "$OUT/security-headers.conf"

printf 'window.__SCHOOLFLOW_CONFIG__ = {\n  API_URL: "%s",\n};\n' "$API_URL" > "$HTML/config.js"

nginx -t -q || fail "configuration nginx invalide."
echo "[entrypoint] frontend App Service : écoute 0.0.0.0:$PORT, API $API_URL, révision $RELEASE_SHA"
exec nginx -g "daemon off;"
