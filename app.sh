#!/usr/bin/env bash
# app.sh — CLI for the application stack (backend + frontend)
# See: docker-compose.yml
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# Emit --env-file flag only when the file exists (safe on clean clones).
env_file_flag() {
  if [[ -f "$ENV_FILE" ]]; then
    echo "--env-file $ENV_FILE"
  fi
}

usage() {
  cat <<EOF
Usage: ./app.sh <command>

Commands:
  up       Start application services — dev profile (backend + Vite frontend)
  down     Stop application services
  build    Build application Docker images
  logs     Tail logs for all application services
  status   Show container status
  test     Smoke test: start backend, poll GET /api/health, then tear down

Profiles:
  Default (./app.sh up)         — backend + frontend-dev (Vite, port 5173)
  Production (./app.sh up prod) — backend + frontend-prod (nginx, port 80)

EOF
  exit 1
}

[[ $# -lt 1 ]] && usage

ENV_FLAG=$(env_file_flag)

case "$1" in
  up)
    # Auto-copy .env.example → .env on first run.
    if [[ ! -f "$ENV_FILE" && -f "$ENV_EXAMPLE" ]]; then
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      echo "✓ Created $ENV_FILE from $ENV_EXAMPLE — set JWT_SECRET_KEY before deploying"
      ENV_FLAG=$(env_file_flag)
    fi
    PROFILE="${2:-dev}"
    echo "→ Starting application services (profile: $PROFILE) …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG --profile "$PROFILE" up -d "${@:3}"
    echo "→ Waiting for backend health check …"
    elapsed=0
    while [ $elapsed -lt 60 ]; do
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null || echo "000")
      if [[ "$HTTP_CODE" == "200" ]]; then
        echo "  ✓ Backend healthy — http://localhost:8000"
        [[ "$PROFILE" == "dev" ]]  && echo "  ✓ Frontend (dev)  — http://localhost:5173"
        [[ "$PROFILE" == "prod" ]] && echo "  ✓ Frontend (prod) — http://localhost:80"
        break
      fi
      sleep 3
      elapsed=$((elapsed + 3))
    done
    if [[ $elapsed -ge 60 ]]; then
      echo "  ⚠ Backend health check timed out. Run './app.sh logs' to investigate."
    fi
    ;;
  down)
    echo "→ Stopping application services …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG --profile dev --profile prod down "${@:2}"
    ;;
  build)
    echo "→ Building application Docker images …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG --profile dev --profile prod build "${@:2}"
    ;;
  logs)
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG --profile dev --profile prod logs -f "${@:2}"
    ;;
  status)
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG --profile dev --profile prod ps "${@:2}"
    ;;
  test)
    # Smoke test: start backend only, poll /api/health until 200 or 30s timeout, tear down.
    # Expected output:
    #   → Smoke test: starting backend …
    #   Waiting up to 30s for GET /api/health → 200 …
    #   ✓ GET /api/health → 200 OK (after Xs)
    #   → Tearing down …
    #   ✓ Smoke test PASSED
    echo "→ Smoke test: starting backend …"
    if [[ ! -f "$ENV_FILE" && -f "$ENV_EXAMPLE" ]]; then
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      ENV_FLAG=$(env_file_flag)
    fi
    # Start only the backend (no profile needed — backend has no profile constraint).
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG up -d backend
    echo "  Waiting up to 30s for GET /api/health → 200 …"
    elapsed=0
    status=1
    while [ $elapsed -lt 30 ]; do
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null || echo "000")
      if [[ "$HTTP_CODE" == "200" ]]; then
        echo "  ✓ GET /api/health → 200 OK (after ${elapsed}s)"
        status=0
        break
      fi
      sleep 2
      elapsed=$((elapsed + 2))
    done
    echo "→ Tearing down …"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" $ENV_FLAG down
    if [[ $status -ne 0 ]]; then
      echo "✗ Smoke test FAILED — /api/health did not return 200 within 30s"
      exit 1
    fi
    echo "✓ Smoke test PASSED"
    ;;
  *)
    echo "Unknown command: $1"
    usage
    ;;
esac
