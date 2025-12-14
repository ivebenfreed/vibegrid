#!/bin/bash
# Add test data to WorkTask records for Vibegrid cell display testing
# Initiative: vibegrid-cell-display-fixes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

# Load environment
source .env 2>/dev/null || true
source .env.local 2>/dev/null || true

ORG_ID="01920000-1000-7000-8000-000000000001"
DEV_PORT="${DEV_PORT:-5173}"

echo "=== Vibegrid Test Data Setup ==="
echo "Adding test data to WorkTask records"
echo ""

# Get auth token
echo "1. Getting auth token..."
TOKEN=$(./scripts/auth/login-test-user.sh "ceo@widecorp.com" "$WIDECORP_TEST_PASSWORD" 2>/dev/null | grep -o 'TOKEN=[^ ]*' | cut -d= -f2 || echo "")

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to get auth token. Make sure dev server is running."
  exit 1
fi
echo "   Got token"

# Get existing WorkTask IDs
echo ""
echo "2. Getting existing WorkTask records..."
RECORDS=$(curl -s "http://localhost:$DEV_PORT/api/orpc/dataforge/data/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Organization-Id: $ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{"entityName": "WorkTask", "limit": 5}')

RECORD_IDS=$(echo "$RECORDS" | jq -r '.records[].id' 2>/dev/null | head -5)

if [ -z "$RECORD_IDS" ]; then
  echo "   No existing records found. Creating test records..."
  # Create a test record
  CREATE_RESP=$(curl -s -X POST "http://localhost:$DEV_PORT/api/orpc/dataforge/data/create" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Organization-Id: $ORG_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "entityName": "WorkTask",
      "data": {
        "title": "Vibegrid Test Task 1",
        "description": "Test task for vibegrid cell display testing"
      }
    }')
  RECORD_IDS=$(echo "$CREATE_RESP" | jq -r '.record.id' 2>/dev/null)
fi

echo "   Found records: $(echo "$RECORD_IDS" | wc -l | tr -d ' ')"

# Update first record with test data
FIRST_ID=$(echo "$RECORD_IDS" | head -1)

echo ""
echo "3. Updating record $FIRST_ID with test data..."

UPDATE_DATA='{
  "test_textarea": "This is a longer text that spans\nmultiple lines to test\ntextarea display.",
  "test_markdown": "# Heading\n\n**Bold** and *italic* text.\n\n- List item 1\n- List item 2",
  "test_integer": 42,
  "test_decimal": 123.45,
  "test_time": "14:30:00",
  "test_json": {"key": "value", "nested": {"a": 1}},
  "test_email": "test@example.com",
  "test_url": "https://example.com/path",
  "test_phone": "+1-555-123-4567",
  "test_color": "#3B82F6",
  "test_currency": 1250.00,
  "test_rating": 4,
  "test_slider": 75,
  "test_single_select": "Option A",
  "test_multi_select": ["Tag 1", "Tag 2"]
}'

RESPONSE=$(curl -s -X POST "http://localhost:$DEV_PORT/api/orpc/dataforge/data/update" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Organization-Id: $ORG_ID" \
  -H "Content-Type: application/json" \
  -d "{\"entityName\": \"WorkTask\", \"recordId\": \"$FIRST_ID\", \"data\": $UPDATE_DATA}")

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "   SUCCESS: Updated record with test data"
else
  echo "   Response: $RESPONSE"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Test at: http://localhost:$DEV_PORT/debug/vibegrid"
echo ""
echo "Field types to verify:"
echo "  - textarea, markdown, integer, decimal, time"
echo "  - json, email, url, phone, color"
echo "  - currency, rating, slider"
echo "  - single-select, multi-select"
