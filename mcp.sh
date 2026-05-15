#!/usr/bin/env bash
# mcp.sh — standalone CLI for MCP services
# See: docker-compose.mcp.yml, services/mcp-context-manager/docs/SETUP.md
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.mcp.yml"
ENV_FILE=".env.mcp"
ENV_EXAMPLE=".env.mcp.example"
# COMPOSE_DIR is the canonical directory of this script (= repo root).
# validate_workspace uses it to resolve WORKSPACE_PATH with the same
# semantics Docker uses for volume mounts.
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Build the --env-file flag only when the file exists.
# Without this guard, `docker compose` errors on a clean clone.
env_file_flag() {
  if [[ -f "$ENV_FILE" ]]; then
    echo "--env-file $ENV_FILE"
  fi
}

# validate_workspace — reads WORKSPACE_PATH from .env.mcp (if present),
# resolves it relative to the compose file's directory (same semantics Docker
# uses for volume mounts), and exits 1 with a clear message if the path does
# not exist.
validate_workspace() {
  local workspace_path="."
  if [[ -f "$ENV_FILE" ]]; then
    # Extract WORKSPACE_PATH, strip inline comments and surrounding whitespace.
    local extracted
    extracted=$(grep -E '^[[:space:]]*WORKSPACE_PATH[[:space:]]*=' "$ENV_FILE" \
      | tail -1 \
      | sed 's/^[^=]*=//; s/#.*//' \
      | tr -d '[:space:]')
    [[ -n "$extracted" ]] && workspace_path="$extracted"
  fi

  # Resolve relative to the compose file's directory (mirrors Docker semantics).
  # Use cd+pwd for portability (realpath -m is GNU-only and absent on macOS).
  local resolved=""
  if [[ "$workspace_path" = /* ]]; then
    resolved="$workspace_path"
  else
    resolved="$COMPOSE_DIR/$workspace_path"
  fi

  if [[ -z "$resolved" || ! -d "$resolved" ]]; then
    echo "✗ WORKSPACE_PATH='$workspace_path' does not resolve to an existing directory."
    echo "  Edit $ENV_FILE and set WORKSPACE_PATH to your project root."
    exit 1
  fi
}

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
  doctor        Diagnose MCP health: checks container, calls /api/v1/diag, pretty-prints result

Environment:
  WORKSPACE_PATH    Path to workspace for MCP to scan (default: current directory)
                    See .env.mcp.example for details.

EOF
  exit 1
}

[[ $# -lt 1 ]] && usage

# Capture the flag once; it is either "--env-file .env.mcp" or empty.
ENV_FLAG=$(env_file_flag)

case "$1" in
  up)
    # Auto-copy .env.mcp.example → .env.mcp on first run.
    if [[ ! -f "$ENV_FILE" && -f "$ENV_EXAMPLE" ]]; then
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      echo "✓ Created $ENV_FILE from $ENV_EXAMPLE — edit it to customize WORKSPACE_PATH and globs"
      # Refresh the flag now that the file exists.
      ENV_FLAG=$(env_file_flag)
    fi
    validate_workspace
    echo "→ Starting MCP services …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG up -d "${@:2}"
    # Poll /api/ready for up to 90s to give user feedback
    echo "→ Waiting for graph indexing to complete …"
    elapsed=0
    while [ $elapsed -lt 90 ]; do
      READY=$(curl -sf http://localhost:3001/api/ready 2>/dev/null | grep -o '"ready":true' || true)
      if [[ -n "$READY" ]]; then
        FILES=$(curl -sf http://localhost:3001/api/v1/diag 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('fileCount',{}).get('total',0))" 2>/dev/null || echo "?")
        echo "  ✓ Graph ready — $FILES files indexed"
        break
      fi
      sleep 2
      elapsed=$((elapsed + 2))
    done
    if [[ $elapsed -ge 90 ]]; then
      echo "  ⚠ Indexing still in progress. Run './mcp.sh doctor' to check status."
    fi
    ;;
  down)
    echo "→ Stopping MCP services …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG down "${@:2}"
    ;;
  build)
    validate_workspace
    echo "→ Building MCP Docker images …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG build "${@:2}"
    ;;
  logs)
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG logs -f "${@:2}"
    ;;
  dev)
    echo "→ Starting MCP Context Manager (tsx) + MCP UI (vite) locally …"
    trap 'kill 0' EXIT
    (cd services/mcp-context-manager && npm run dev) &
    (cd services/mcp-context-ui && npm run dev) &
    wait
    ;;
  restart)
    validate_workspace
    echo "→ Restarting MCP services …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG restart "${@:2}"
    ;;
  status)
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG ps "${@:2}"
    ;;
  test)
    echo "→ Running MCP Context Manager tests …"
    (cd services/mcp-context-manager && npx vitest --run "${@:2}")
    ;;
  shell)
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG exec mcp-context-manager sh
    ;;
  doctor)
    # 1. Check container is running.
    # shellcheck disable=SC2086
    RUNNING=$(docker compose -f "$COMPOSE_FILE" $ENV_FLAG ps --status running --quiet mcp-context-manager 2>/dev/null || true)
    if [[ -z "$RUNNING" ]]; then
      echo "✗ MCP is not running — try ./mcp.sh up first"
      exit 2
    fi

    # 2. Check readiness before diag.
    READY_JSON=$(curl -sf "http://localhost:3001/api/ready" 2>/dev/null) || true
    if [[ -n "$READY_JSON" ]]; then
      READY=$(echo "$READY_JSON" | grep -o '"ready":true' || true)
      if [[ -z "$READY" ]]; then
        echo "⚠ Service is still indexing — graph not yet ready"
        echo "  Wait a moment and retry, or check: ./mcp.sh logs mcp-context-manager"
      fi
    fi

    # 3. Fetch /api/v1/diag.
    DIAG_URL="http://localhost:3001/api/v1/diag"
    DIAG_JSON=$(curl -sf "$DIAG_URL" 2>/dev/null) || {
      echo "✗ Could not reach $DIAG_URL"
      echo "  Check container logs: ./mcp.sh logs mcp-context-manager"
      exit 3
    }

    # 4. Pretty-print: prefer jq, fall back to python3, fall back to raw.
    echo "── MCP Doctor ──────────────────────────────"
    if command -v jq &>/dev/null; then
      echo "$DIAG_JSON" | jq .
    elif command -v python3 &>/dev/null; then
      echo "$DIAG_JSON" | python3 -m json.tool
    else
      echo "$DIAG_JSON"
    fi
    echo "────────────────────────────────────────────"

    # 5. Exit non-zero when degraded or no files indexed.
    DEGRADED=$(echo "$DIAG_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('degraded') or d.get('fileCount',{}).get('total',0)==0 else '0')" 2>/dev/null || echo "0")
    if [[ "$DEGRADED" == "1" ]]; then
      echo "✗ MCP is degraded — see 'reasons' above"
      exit 4
    fi
    echo "✓ MCP is healthy"
    exit 0
    ;;
  *)
    echo "Unknown command: $1"
    usage
    ;;
esac
