#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Run on the host, outside the restricted Codex environment.
test "$(id -u)" = 0 || { echo 'Run as root.' >&2; exit 1; }
# Build the current workspace, including the Notes and Checklist fixes.
docker build -t cdmm:local .
override=$(mktemp /tmp/cdmm-domain.XXXXXX.yaml)
trap 'rm -f "$override"' EXIT
cat > "$override" <<'YAML'
services:
  cdmm:
    image: cdmm:local
    pull_policy: never
    ports:
      - "127.0.0.1:5173:5173"
YAML
docker compose -f compose.yaml -f "$override" up -d --no-deps cdmm

install -d /var/www/letsencrypt
config=/etc/nginx/sites-available/cdmm.vitalvoi.beer
if [ -e "$config" ]; then
    cp -a "$config" "$config.backup.$(date +%Y%m%d%H%M%S)"
fi

# Enable the HTTP challenge before requesting the domain's certificate.
cat > "$config" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name cdmm.vitalvoi.beer;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { proxy_pass http://127.0.0.1:5173; proxy_set_header Host $host; }
}
NGINX
ln -sfn "$config" /etc/nginx/sites-enabled/cdmm.vitalvoi.beer
nginx -t
systemctl reload nginx
if ! certbot certonly --webroot -w /var/www/letsencrypt -d cdmm.vitalvoi.beer; then
    echo 'Certificate issuance failed. CDMM is running; the HTTP proxy remains enabled.' >&2
    echo 'For CAA SERVFAIL, diagnose DNS before retrying:' >&2
    echo 'dig @1.1.1.1 cdmm.vitalvoi.beer CAA +dnssec' >&2
    echo 'dig @1.1.1.1 cdmm.vitalvoi.beer CAA +dnssec +cdflag' >&2
    echo 'dig @1.1.1.1 vitalvoi.beer NS' >&2
    exit 1
fi
install -m 644 deploy/cdmm.nginx.conf "$config"
nginx -t
systemctl reload nginx

curl --fail --retry 10 --retry-connrefused --retry-delay 2 https://cdmm.vitalvoi.beer/ -o /dev/null
