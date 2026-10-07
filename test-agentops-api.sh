#!/bin/bash

# Test AgentOps API endpoints
# First, get a JWT token by logging in

echo "=== Testing AgentOps API Endpoints ==="
echo ""

# Get token (you'll need to replace these with actual credentials)
echo "1. Getting auth token..."
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }')

# Extract token (using jq if available, otherwise manual)
if command -v jq &> /dev/null; then
    TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.token')
else
    # Fallback if jq not available
    TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"token":"[^"]*' | sed 's/"token":"//')
fi

echo "Token: ${TOKEN:0:20}..."
echo ""

# Test traces endpoint
echo "2. Testing /api/agentops/traces endpoint..."
curl -s -X GET "http://localhost:5001/api/agentops/traces?limit=5&page=0" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.' || cat

echo ""
echo ""

# Test metrics endpoint
echo "3. Testing /api/agentops/metrics endpoint..."
curl -s -X GET "http://localhost:5001/api/agentops/metrics" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.' || cat

echo ""
