#!/bin/sh
set -eu

# ─── API_PUBLIC_BASE_URL is optional ────────────────────────────────────────
# If set, nginx will proxy /api-proxy/* to the backend.
# If NOT set, /api-proxy will return 404 — use config.js for direct API calls.
if [ -z "${API_PUBLIC_BASE_URL:-}" ]; then
    export API_PUBLIC_BASE_URL="http://localhost:8000"
    echo "[WARN] API_PUBLIC_BASE_URL not set — /api-proxy disabled."
    echo "       Use config.js or VITE_API_URL for direct API calls."
fi

# ─── PORT is required by Render ─────────────────────────────────────────────
export PORT="${PORT:-10000}"

# ─── Generate nginx config from template ────────────────────────────────────
envsubst '${PORT} ${API_PUBLIC_BASE_URL}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

echo "[INFO] Starting nginx on port ${PORT}"
echo "[INFO] API proxy → ${API_PUBLIC_BASE_URL}"

nginx -g 'daemon off;'
