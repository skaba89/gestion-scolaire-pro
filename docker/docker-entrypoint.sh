#!/bin/sh
# Inject runtime environment variables into config.js at container startup.
# This allows configuring the frontend without rebuilding the Docker image.
set -e

CONFIG_FILE="/usr/share/nginx/html/config.js"

cat > "$CONFIG_FILE" <<EOF
window.__SCHOOLFLOW_CONFIG__ = {
  API_URL: "${SCHOOLFLOW_API_URL:-}",
  APP_NAME: "${SCHOOLFLOW_APP_NAME:-SchoolFlow Pro}",
  SENTRY_DSN: "${SCHOOLFLOW_SENTRY_DSN:-}",
  ONESIGNAL_APP_ID: "${SCHOOLFLOW_ONESIGNAL_APP_ID:-}",
};
EOF

echo "Runtime config injected into $CONFIG_FILE"

exec nginx -g "daemon off;"
