#!/bin/sh
set -eu

: "${API_PUBLIC_HOSTNAME:?API_PUBLIC_HOSTNAME is required}"
: "${KEYCLOAK_PUBLIC_HOSTNAME:?KEYCLOAK_PUBLIC_HOSTNAME is required}"

export API_PUBLIC_HOSTNAME
export KEYCLOAK_PUBLIC_HOSTNAME

envsubst '${API_PUBLIC_HOSTNAME} ${KEYCLOAK_PUBLIC_HOSTNAME}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

nginx -g 'daemon off;'
