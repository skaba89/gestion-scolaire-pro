#!/usr/bin/env bash
# Test de fumée de l'image frontend App Service (Dockerfile.appservice).
# Usage : scripts/ci/smoke-frontend-appservice.sh <image> [release_sha]
# Exécuté par build-images.yml AVANT tout push vers ACR, et en local.
set -euo pipefail

IMAGE="${1:?image attendue}"
EXPECTED_SHA="${2:-unknown}"
API="https://api.smoke.invalid"
HOST_PORT="${SMOKE_HOST_PORT:-18080}"
NAME="smoke-frontend-appservice-$$"
FAILED=0
WORK="$(mktemp -d)"

pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*"; FAILED=1; }
cleanup() { docker rm -f "$NAME" "$NAME-neg" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

# 1. Démarrage avec la configuration de production (PORT=10000, VITE_API_URL)
docker run -d --name "$NAME" -p "127.0.0.1:$HOST_PORT:10000" \
  -e PORT=10000 -e VITE_API_URL="$API/" "$IMAGE" >/dev/null
ok=""
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$HOST_PORT/healthz" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ -n "$ok" ]; then pass "conteneur démarré, /healthz répond"; else
  fail "conteneur non joignable"; docker logs "$NAME" 2>&1 | tail -20; exit 1; fi

health=$(curl -fsS "http://127.0.0.1:$HOST_PORT/healthz")
printf '%s' "$health" | grep -q "\"release_sha\":\"$EXPECTED_SHA\"" \
  && pass "/healthz release_sha = $EXPECTED_SHA" || fail "/healthz = $health (attendu $EXPECTED_SHA)"

# 2. Écoute réelle sur 0.0.0.0:10000 (table /proc/net/tcp : 00000000:2710, état 0A = LISTEN)
if docker exec "$NAME" sh -c 'grep -q " 00000000:2710 00000000:0000 0A " /proc/net/tcp'; then
  pass "écoute sur 0.0.0.0:10000"; else fail "pas d'écoute sur 0.0.0.0:10000"; fi

# 3. Processus non-root
uid=$(docker exec "$NAME" id -u)
[ "$uid" != "0" ] && pass "processus non-root (uid $uid)" || fail "processus root"

# 4. SPA, config.js, fallback, en-têtes
code=$(curl -s -o "$WORK/index.html" -w '%{http_code}' "http://127.0.0.1:$HOST_PORT/")
[ "$code" = "200" ] && grep -q 'id="root"' "$WORK/index.html" && pass "GET / = 200 (index.html)" || fail "GET / = $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$HOST_PORT/admin/students")
[ "$code" = "200" ] && pass "fallback SPA = 200" || fail "fallback SPA = $code"
cfg=$(curl -fsS "http://127.0.0.1:$HOST_PORT/config.js")
printf '%s' "$cfg" | grep -q "API_URL: \"$API\"" && pass "config.js API_URL = $API" || fail "config.js : $cfg"
csp=$(curl -fsSI "http://127.0.0.1:$HOST_PORT/" | tr -d '\r' | grep -i '^content-security-policy:' || true)
printf '%s' "$csp" | grep -q "connect-src 'self' $API" && pass "CSP connect-src contient l'API" || fail "CSP : $csp"
curl -fsSI "http://127.0.0.1:$HOST_PORT/config.js" | tr -d '\r' | grep -qi '^cache-control: no-cache, no-store' \
  && pass "config.js non mis en cache" || fail "config.js mis en cache"

# 5. Aucune référence au nom d'hôte docker-compose « api » ni proxy
if docker exec "$NAME" sh -c 'grep -rqsE "api:8000|proxy_pass" /etc/nginx /tmp/nginx-appservice'; then
  fail "référence api:8000 / proxy_pass présente dans la configuration nginx"
else pass "aucune référence api:8000 / proxy_pass dans la configuration nginx"; fi
if docker exec "$NAME" sh -c 'grep -rqs "api:8000" /usr/share/nginx/html'; then
  fail "référence api:8000 dans les fichiers servis"; else pass "aucune référence api:8000 dans les fichiers servis"; fi

# 6. Aucun secret dans la configuration de l'image ni fichier .env embarqué
envkeys=$(docker image inspect "$IMAGE" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort | tr '\n' ' ')
if printf '%s' "$envkeys" | grep -Eqi 'SECRET|PASSWORD|TOKEN|KEY|DATABASE|CONNECTION'; then
  fail "variable sensible dans l'image : $envkeys"; else pass "variables de l'image : $envkeys"; fi
if docker exec "$NAME" sh -c 'find / -xdev \( -name ".env" -o -name ".env.*" -o -name "id_rsa*" \) 2>/dev/null | grep -q .'; then
  fail "fichier .env ou clé SSH présent dans l'image"; else pass "aucun fichier .env ni clé SSH dans l'image"; fi
# Clés privées (les bundles CA publics /etc/ssl*/cert.pem ne contiennent que des certificats).
if docker exec "$NAME" sh -c 'find / -xdev -type f -size -1024k 2>/dev/null | xargs grep -lsI "PRIVATE KEY-----" 2>/dev/null | grep -q .'; then
  fail "clé privée présente dans l'image"; else pass "aucune clé privée dans l'image"; fi

# 7. Échecs explicites : sans URL d'API, URL non HTTPS, PORT invalide
for args in "-e PORT=10000" "-e PORT=10000 -e VITE_API_URL=http://api.smoke.invalid" "-e PORT=abc -e VITE_API_URL=$API"; do
  # shellcheck disable=SC2086
  if docker run --rm --name "$NAME-neg" $args "$IMAGE" >"$WORK/neg.log" 2>&1; then
    fail "démarrage accepté avec [$args]"
  else
    grep -q "ERREUR" "$WORK/neg.log" && pass "refus explicite avec [$args]" || fail "échec sans message avec [$args]"
  fi
done

docker logs "$NAME" 2>&1 | grep -q "\[emerg\]" && fail "nginx [emerg] dans les journaux" || pass "aucune erreur [emerg] nginx"

[ "$FAILED" = "0" ] && echo "SMOKE: PASS" || { echo "SMOKE: FAIL"; exit 1; }
