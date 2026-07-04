# ─── SchoolFlow Pro — Frontend Dockerfile ──────────────────────────────────
# Multi-stage build: Node builder → Nginx runtime
# Used by docker-compose.yml for local development
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies first (layer caching).
# We intentionally use npm install instead of npm ci because the current lockfile
# can miss transitive/root package entries after large dependency additions.
# npm install keeps Docker builds aligned with package.json and avoids missing
# modules such as @radix-ui/react-dropdown-menu during Vite production builds.
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
# Default to /api so nginx proxies API calls (docker-compose passes VITE_API_URL=/api).
# Fallback http://localhost:8000 was causing direct API calls that bypassed nginx.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
# Force-clear old service worker caches on first load after deployment
ENV VITE_FORCE_SW_RESET=true
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build

# ─── Production: Nginx serves static files (with brotli module) ──────────────
FROM fholzer/nginx-brotli:latest

# Replace main nginx.conf (pid → /tmp, no user directive, temp paths → /tmp)
COPY docker/nginx-main.conf /etc/nginx/nginx.conf

# Copy custom server block config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy runtime config entrypoint
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Ensure nginx can write to needed dirs and entrypoint is executable
RUN chmod +x /docker-entrypoint.sh && \
    chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:80/"]

ENTRYPOINT ["/docker-entrypoint.sh"]
