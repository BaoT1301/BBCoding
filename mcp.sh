#!/usr/bin/env bash
# mcp.sh — standalone CLI for MCP services
# See: docker-compose.mcp.yml, services/mcp-context-manager/docs/SETUP.md
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.mcp.yml"

usage() {
  cat <<EOF
Usage: ./mcp.sh <command>

Commands:
  up            Start MCP services (docker compose up -d)
  down          Stop MCP services
  build         Build MCP Docker images
  logs          Tail logs for MCP services
  dev           Start MCP Context Manager (tsx) + MCP UI (vite) locally without Docker
  restart       Restart MCP services
  status        Show MCP container status
  test          Run MCP Context Manager test suite (vitest)
  shell         Open a shell in the mcp-context-manager container

Environment:
  WORKSPACE_PATH    Path to workspace for MCP to scan (default: current directory)
                    See .env.mcp.example for details.

EOF
  exit 1
}

[[ $# -lt 1 ]] && usage

case "$1" in
  up)
    echo "→ Starting MCP services …"
    docker compose -f "$COMPOSE_FILE" up -d "${@:2}"
    ;;
  down)
    echo "→ Stopping MCP services …"
    docker compose -f "$COMPOSE_FILE" down "${@:2}"
    ;;
  build)
    echo "→ Building MCP Docker images …"
    docker compose -f "$COMPOSE_FILE" build "${@:2}"
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f "${@:2}"
    ;;
  dev)
    echo "→ Starting MCP Context Manager (tsx) + MCP UI (vite) locally …"
    trap 'kill 0' EXIT
    (cd services/mcp-context-manager && npm run dev) &
    (cd services/mcp-context-ui && npm run dev) &
    wait
    ;;
  restart)
    echo "→ Restarting MCP services …"
    docker compose -f "$COMPOSE_FILE" restart "${@:2}"
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps "${@:2}"
    ;;
  test)
    echo "→ Running MCP Context Manager tests …"
    (cd services/mcp-context-manager && npx vitest --run "${@:2}")
    ;;
  shell)
    docker compose -f "$COMPOSE_FILE" exec mcp-context-manager sh
    ;;
  *)
    echo "Unknown command: $1"
    usage
    ;;
esac
