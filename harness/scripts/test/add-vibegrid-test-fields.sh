#!/bin/bash
# Add test fields to WorkTask for Vibegrid cell display testing
# Initiative: vibegrid-cell-display-fixes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

# Load environment
set -a
source .env 2>/dev/null || true
source .env.local 2>/dev/null || true
set +a

ORG_ID="01920000-1000-7000-8000-000000000001"
DEV_PORT="${DEV_PORT:-5173}"

echo "=== Vibegrid Test Fields Setup ==="
echo "Adding test fields to WorkTask entity for cell display testing"
echo ""

# Get auth token
echo "1. Getting auth token..."
LOGIN_RESP=$(curl -s -X POST "http://localhost:$DEV_PORT/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"ceo@widecorp.com\",\"password\":\"$WIDECORP_TEST_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.token' 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Failed to get auth token. Response: $LOGIN_RESP"
  exit 1
fi
echo "   Got token: ${TOKEN:0:10}..."

# Add fields via API
echo ""
echo "2. Adding test fields to WorkTask..."

# Test fields covering missing types
FIELDS='[
  {"name": "test_textarea", "type": "textarea", "description": "Test textarea field"},
  {"name": "test_markdown", "type": "markdown", "description": "Test markdown field"},
  {"name": "test_integer", "type": "integer", "description": "Test integer field"},
  {"name": "test_decimal", "type": "decimal", "description": "Test decimal field", "precision": 2},
  {"name": "test_time", "type": "time", "description": "Test time field"},
  {"name": "test_json", "type": "json", "description": "Test JSON field"},
  {"name": "test_email", "type": "email", "description": "Test email field"},
  {"name": "test_url", "type": "url", "description": "Test URL field"},
  {"name": "test_phone", "type": "phone", "description": "Test phone field"},
  {"name": "test_color", "type": "color", "description": "Test color field"},
  {"name": "test_currency", "type": "currency", "description": "Test currency field", "currencyCode": "USD"},
  {"name": "test_rating", "type": "rating", "description": "Test rating field", "max": 5},
  {"name": "test_slider", "type": "slider", "description": "Test slider field", "min": 0, "max": 100},
  {"name": "test_single_select", "type": "single-select", "description": "Test single select", "options": ["Option A", "Option B", "Option C"]},
  {"name": "test_multi_select", "type": "multi-select", "description": "Test multi select", "options": ["Tag 1", "Tag 2", "Tag 3"]}
]'

RESPONSE=$(curl -s -X POST "http://localhost:$DEV_PORT/api/orpc/dataforge/entities/update" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Organization-Id: $ORG_ID" \
  -H "Content-Type: application/json" \
  -d "{\"entityName\": \"WorkTask\", \"addFields\": $FIELDS}")

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "   SUCCESS: Added test fields"
  echo "$RESPONSE" | jq -r '.entity.fields | keys | length' 2>/dev/null && echo " total fields" || true
else
  echo "   Response: $RESPONSE"
fi

echo ""
echo "3. Test fields added. Now add test data..."
echo ""
echo "To add test data, run:"
echo "  ./scripts/test/add-vibegrid-test-data.sh"
echo ""
echo "To test in browser:"
echo "  http://localhost:$DEV_PORT/debug/vibegrid"
