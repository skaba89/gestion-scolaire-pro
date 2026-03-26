#!/bin/sh
set -eu

: "${API_PUBLIC_BASE_URL:?API_PUBLIC_BASE_URL is required}"

export API_PUBLIC_BASE_URL

envsubst '${API_PUBLIC_BASE_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

nginx -g 'daemon off;'
