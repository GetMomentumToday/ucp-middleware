#!/usr/bin/env bash
set -euo pipefail

##
# Create cart price rules and coupon codes in Magento for E2E testing.
#
# Usage:
#   bash tests/e2e-magento/seed-coupons.sh
#
# Prerequisites:
#   - Magento running with admin API accessible
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAGENTO_URL="${MAGENTO_URL:-http://localhost:8080}"

if [ -f "$SCRIPT_DIR/.magento-token" ]; then
  TOKEN=$(cat "$SCRIPT_DIR/.magento-token" | tr -d '"\n\r ' | grep -oE '[a-zA-Z0-9]{20,}' || true)
  TOKEN=$(echo "$TOKEN" | head -1)
fi

if [ -z "${TOKEN:-}" ]; then
  RAW=$(curl -s -X POST "${MAGENTO_URL}/rest/V1/integration/admin/token" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -d '{"username":"admin","password":"magentorocks1"}' || true)
  TOKEN=$(echo "$RAW" | tr -d '"\n\r ' | grep -oE '[a-zA-Z0-9]{20,}' || true)
  TOKEN=$(echo "$TOKEN" | head -1)
fi

if [ -z "$TOKEN" ]; then
  echo "ERROR: No Magento admin token available."
  exit 1
fi

AUTH="Authorization: Bearer ${TOKEN}"

echo "=== Seeding coupon codes ==="

create_rule_and_coupon() {
  local name="$1" discount="$2" action="$3" code="$4"

  echo "Creating rule: $name ($discount $action) with coupon $code..."

  RULE_ID=$(curl -s -X POST "${MAGENTO_URL}/rest/V1/salesRules" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{
      \"rule\": {
        \"name\": \"$name\",
        \"is_active\": true,
        \"discount_amount\": $discount,
        \"simple_action\": \"$action\",
        \"coupon_type\": \"SPECIFIC_COUPON\",
        \"website_ids\": [1],
        \"customer_group_ids\": [0, 1]
      }
    }" | python3 -c "import sys,json; print(json.load(sys.stdin).get('rule_id',''))" 2>/dev/null || true)

  if [ -z "$RULE_ID" ]; then
    echo "  Rule already exists or failed — skipping."
    return
  fi

  curl -s -X POST "${MAGENTO_URL}/rest/V1/coupons" \
    -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"coupon\":{\"rule_id\":$RULE_ID,\"code\":\"$code\",\"usage_limit\":0,\"usage_per_customer\":0,\"type\":0}}" > /dev/null 2>&1

  echo "  Rule $RULE_ID + coupon $code created."
}

create_rule_and_coupon "UCP 10pct Off" 10 "by_percent" "UCPTEST10"
create_rule_and_coupon "UCP 5 USD Off" 5 "by_fixed" "UCPTEST5"

echo ""
echo '=== Coupons seeded: UCPTEST10 (10% off), UCPTEST5 ($5 off) ==='
