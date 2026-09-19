#!/bin/sh
# ─── Render Frontend Entrypoint ────────────────────────────────────────────
# Substitutes environment variables into config.js at runtime (after build).
# This allows the same Docker image to work across environments without rebuild.
# ─────────────────────────────────────────────────────────────────────────────

# nginx:alpine's own /docker-entrypoint.sh only runs its envsubst-on-templates
# step when argv[1] is literally "nginx"/"nginx-debug" — since our CMD invokes
# this script instead, that step never fires and /etc/nginx/templates/*.template
# is left untouched. Do the substitution ourselves before starting nginx.
export PORT="${PORT:-10000}"
TEMPLATE="/etc/nginx/templates/default.conf.template"
NGINX_CONF="/etc/nginx/conf.d/default.conf"
if [ -f "$TEMPLATE" ]; then
    envsubst '${PORT} ${BACKEND_HOST} ${BACKEND_PORT} ${CSP_CONNECT_SRC}' < "$TEMPLATE" > "$NGINX_CONF"
    echo "[entrypoint] nginx config generated from template (PORT=$PORT, BACKEND_HOST=$BACKEND_HOST, BACKEND_PORT=$BACKEND_PORT)"
fi

CONFIG_FILE="/usr/share/nginx/html/config.js"

if [ -f "$CONFIG_FILE" ]; then
    # Replace placeholder API_URL with the actual runtime value
    if [ -n "$VITE_API_URL" ]; then
        sed -i "s|API_URL:.*|API_URL: \"$VITE_API_URL\"|g" "$CONFIG_FILE"
        echo "[entrypoint] config.js API_URL set to: $VITE_API_URL"
    fi
fi

# Generate CSRF-safe nonce for inline scripts if needed
echo "[entrypoint] Starting nginx..."
exec nginx -g "daemon off;"
