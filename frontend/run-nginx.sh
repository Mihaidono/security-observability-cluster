#!/bin/sh
set -eu

BACKEND_HOST="${BACKEND_HOST:-backend}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
KEYCLOAK_HOST="${KEYCLOAK_HOST:-keycloak}"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-isolens}"
PUBLIC_SCHEME="${PUBLIC_SCHEME:-\$scheme}"
PUBLIC_HOST="${PUBLIC_HOST:-\$http_host}"
PUBLIC_PORT="${PUBLIC_PORT:-\$server_port}"

case "$KEYCLOAK_REALM" in
  *[!A-Za-z0-9_-]*) echo "Invalid KEYCLOAK_REALM" >&2; exit 1 ;;
esac

mkdir -p /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp

sed \
  -e "s/__BACKEND_HOST__/${BACKEND_HOST}/g" \
  -e "s/__BACKEND_PORT__/${BACKEND_PORT}/g" \
  -e "s/__KEYCLOAK_HOST__/${KEYCLOAK_HOST}/g" \
  -e "s/__KEYCLOAK_PORT__/${KEYCLOAK_PORT}/g" \
  -e "s/__KEYCLOAK_REALM__/${KEYCLOAK_REALM}/g" \
  -e "s/__PUBLIC_SCHEME__/${PUBLIC_SCHEME}/g" \
  -e "s/__PUBLIC_HOST__/${PUBLIC_HOST}/g" \
  -e "s/__PUBLIC_PORT__/${PUBLIC_PORT}/g" \
  /etc/nginx/templates/nginx.conf.template > /tmp/nginx.conf

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
