#!/bin/bash
# mcp-deploy.sh — MCP-only production deployment (build, health check, restart)
# Deploys MCP services standalone (build, health check, restart).
set -e

COMPOSE_FILE="docker-compose.mcp.yml"
HEALTH_TIMEOUT=90
HEALTH_URL="http://localhost:3001/api/ready"
MCP_UI_URL="http://localhost:8080"

# ─── Step 1: Banner ─────────────────────────────────────────────────────────────
echo ""
echo "=== MCP Services Deployment ==="
echo ""

# ─── Step 2: Verify compose file exists ──────────────────────────────────────────
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: $COMPOSE_FILE not found in $(pwd)"
  echo "  Are you running this from the project root?"
  exit 1
fi

# ─── Step 3: Stop existing MCP containers gracefully ─────────────────────────────
echo "→ Stopping existing MCP containers …"
docker compose -f "$COMPOSE_FILE" down --timeout 10
echo "  ✓ Containers stopped"
echo ""

# ─── Step 4: Build images ────────────────────────────────────────────────────────
echo "→ Building MCP Docker images …"
docker compose -f "$COMPOSE_FILE" build
echo "  ✓ Images built"
echo ""

# ─── Step 5: Start services ──────────────────────────────────────────────────────
echo "→ Starting MCP services …"
docker compose -f "$COMPOSE_FILE" up -d
echo "  ✓ Services started"
echo ""

# ─── Step 6: Wait for health check ──────────────────────────────────────────────
echo "→ Waiting for mcp-context-manager health check (up to ${HEALTH_TIMEOUT}s) …"
elapsed=0
while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
  if docker exec mcp-context-manager wget -qO /dev/null "$HEALTH_URL" 2>/dev/null; then
    echo "  ✓ mcp-context-manager is healthy"
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

if [ $elapsed -ge $HEALTH_TIMEOUT ]; then
  echo "  ⚠ Health check timed out after ${HEALTH_TIMEOUT}s"
  echo "  Check logs: docker compose -f $COMPOSE_FILE logs mcp-context-manager"
  exit 1
fi
echo ""

# ─── Step 7: Container status ────────────────────────────────────────────────────
echo "→ Container status:"
docker compose -f "$COMPOSE_FILE" ps
echo ""

# ─── Step 8: Success ─────────────────────────────────────────────────────────────
echo "=== MCP Deployment Complete ==="
echo ""
echo "  MCP Context Manager:  http://localhost:3001 (internal)"
echo "  MCP Context UI:       $MCP_UI_URL"
echo ""
echo "  AI tool integration:"
echo "    docker exec -i mcp-context-manager node dist/server.js --stdio-only"
echo ""
