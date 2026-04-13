#!/bin/bash
# ─── Render Frontend Entrypoint ────────────────────────────────────────────
# Substitutes environment variables into config.js at runtime (after build).
# This allows the same Docker image to work across environments without rebuild.
# ─────────────────────────────────────────────────────────────────────────────

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
