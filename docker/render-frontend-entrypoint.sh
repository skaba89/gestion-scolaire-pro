#!/bin/sh
set -eu

: "${API_INTERNAL_HOSTPORT:?API_INTERNAL_HOSTPORT is required}"
: "${KEYCLOAK_INTERNAL_HOSTPORT:?KEYCLOAK_INTERNAL_HOSTPORT is required}"

export API_INTERNAL_HOSTPORT
export KEYCLOAK_INTERNAL_HOSTPORT

envsubst '${API_INTERNAL_HOSTPORT} ${KEYCLOAK_INTERNAL_HOSTPORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

nginx -g 'daemon off;'
