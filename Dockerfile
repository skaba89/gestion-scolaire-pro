# ─── SchoolFlow Pro — Frontend Dockerfile ──────────────────────────────────
# Multi-stage build: Node builder → Nginx runtime
# Used by docker-compose.yml for local development
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies first (layer caching).
# npm ci: strict, reproducible install from package-lock.json only (fails
# loudly if the lockfile and package.json drift apart, instead of silently
# rewriting the lockfile like `npm install` would). Verified compatible
# before this switch: `npm ci --legacy-peer-deps` succeeds cleanly against
# the current lockfile (1010 packages, no errors) — the earlier "lockfile
# can miss entries" issue no longer applies now that the lockfile has been
# kept in sync via repeated `npm install` runs during dependency updates.
# If a future dependency change breaks `npm ci` again, run `npm install`
# locally to repair package-lock.json and commit the result — don't revert
# to `npm install` inside the Dockerfile, which reintroduces non-reproducible
# builds (supply-chain risk: a transitive dependency can resolve to a
# different version between two otherwise-identical builds).
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

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
# Pinned by digest (not :latest) for reproducible, supply-chain-safe builds —
# two builds run months apart must produce the same base image. Re-pin by
# running: docker pull fholzer/nginx-brotli:latest && docker inspect
# fholzer/nginx-brotli:latest --format='{{index .RepoDigests 0}}'
FROM fholzer/nginx-brotli@sha256:139a061272fa40c82f18c0eb0bdaa14dde350a739a6138d14ca03d3010683f69

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
