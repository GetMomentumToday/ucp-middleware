#!/usr/bin/env bash
set -euo pipefail

##
# Seed a Magento tenant in the UCP Gateway database.
#
# Usage:
#   bash tests/e2e-magento/seed-tenant.sh
#
# Prerequisites:
#   - Postgres running (docker-compose.dev.yml)
#   - Magento token in tests/e2e-magento/.magento-token
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MAGENTO_URL="${MAGENTO_URL:-http://localhost:8080}"
GATEWAY_PORT="${GATEWAY_PORT:-3000}"
DB_CONTAINER="${DB_CONTAINER:-ucp-middleware-postgres-1}"

# Read token from file or generate fresh
if [ -f "$SCRIPT_DIR/.magento-token" ]; then
  TOKEN=$(cat "$SCRIPT_DIR/.magento-token")
else
  TOKEN=$(curl -s -X POST "${MAGENTO_URL}/rest/V1/integration/admin/token" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"magentorocks1"}' | tr -d '"')
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: No Magento token available."
  exit 1
fi

echo "=== Seeding Magento tenant ==="
echo "Magento URL: $MAGENTO_URL"
echo "Gateway port: $GATEWAY_PORT"
echo ""

# ── Create tenants table if not exists ─────────────────────────────────────
echo "1. Ensuring tenants table exists..."
docker exec "$DB_CONTAINER" psql -U ucp -d ucp -c "
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  platform VARCHAR(100) NOT NULL,
  adapter_config JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);" 2>&1 | grep -v "^$"

# ── Upsert tenant (delete + insert to handle both slug and domain conflicts)
echo "2. Upserting magento-e2e tenant..."
docker exec "$DB_CONTAINER" psql -U ucp -d ucp -c "
DELETE FROM tenants WHERE slug = 'magento-e2e' OR domain = 'localhost:${GATEWAY_PORT}';
INSERT INTO tenants (slug, domain, platform, adapter_config)
VALUES (
  'magento-e2e',
  'localhost:${GATEWAY_PORT}',
  'magento',
  '{\"storeUrl\": \"${MAGENTO_URL}\", \"apiKey\": \"${TOKEN}\"}'::jsonb
);
" 2>&1 | grep -v "^$"

# ── Flush Redis tenant cache ──────────────────────────────────────────────
echo "3. Flushing Redis cache..."
REDIS_CONTAINER="${REDIS_CONTAINER:-ucp-middleware-redis-1}"
docker exec "$REDIS_CONTAINER" redis-cli FLUSHALL > /dev/null 2>&1 || true

echo ""
echo "=== Tenant seeded ==="
echo "Domain: localhost:${GATEWAY_PORT} → Magento at ${MAGENTO_URL}"
