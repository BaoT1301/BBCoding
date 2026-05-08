#!/bin/bash

# Track 2 - Schema Fix Verification Script
# This script helps verify that the Zod schema fix resolved the validation errors

echo "=========================================="
echo "Track 2 - Schema Fix Verification"
echo "=========================================="
echo ""

# Check if mcp-ui container is running
echo "1. Checking mcp-ui container status..."
if docker-compose ps mcp-ui | grep -q "Up.*healthy"; then
    echo "   ✅ mcp-ui container is running and healthy"
else
    echo "   ❌ mcp-ui container is not healthy"
    echo "   Run: docker-compose up -d mcp-ui"
    exit 1
fi
echo ""

# Check if the API is responding
echo "2. Testing API endpoint..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/mcp/graph?scope=repo&maxNodes=10)
if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ API endpoint responding (HTTP $HTTP_STATUS)"
else
    echo "   ❌ API endpoint not responding (HTTP $HTTP_STATUS)"
    exit 1
fi
echo ""

# Check node types returned by API
echo "3. Checking node types returned by API..."
NODE_TYPES=$(curl -s "http://localhost:8080/api/mcp/graph?scope=repo&maxNodes=100" | jq -r '.nodes[].type' | sort -u)
echo "   Node types found:"
echo "$NODE_TYPES" | while read -r type; do
    echo "      - $type"
done
echo ""

# Verify "external" type is present
if echo "$NODE_TYPES" | grep -q "external"; then
    echo "   ✅ 'external' node type is present in API response"
else
    echo "   ⚠️  'external' node type not found (might not be in this sample)"
fi
echo ""

# Check frontend schema
echo "4. Checking frontend Zod schema..."
if grep -q '"external"' services/mcp-context-ui/src/types/mcp.ts; then
    echo "   ✅ Frontend schema includes 'external' node type"
else
    echo "   ❌ Frontend schema missing 'external' node type"
    echo "   The fix was not applied correctly!"
    exit 1
fi
echo ""

# Final instructions
echo "=========================================="
echo "Manual Verification Steps"
echo "=========================================="
echo ""
echo "1. Open your browser to: http://localhost:8080"
echo ""
echo "2. Open DevTools Console (F12)"
echo ""
echo "3. Look for these indicators:"
echo "   ✅ No Zod validation errors"
echo "   ✅ Console logs: '[useMcpGraph] Received graph data'"
echo "   ✅ React Flow canvas renders with nodes and edges"
echo "   ✅ No MIME type errors"
echo ""
echo "4. If you see Zod errors about 'external' type:"
echo "   - The browser might be caching old JavaScript"
echo "   - Try hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)"
echo "   - Or clear browser cache and reload"
echo ""
echo "=========================================="
echo "Schema Fix Applied Successfully!"
echo "=========================================="
