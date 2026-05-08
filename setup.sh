#!/usr/bin/env bash
# setup.sh — Interactive initializer for the AI Workflow Template
# Generates cluster-config.json, .env.mcp, and AI tool config from prompts.
# Usage:
#   ./setup.sh                          # interactive mode
#   ./setup.sh --non-interactive        # reads answers from setup.answers.yml
#   ./setup.sh --non-interactive --force  # overwrite existing output files
set -euo pipefail
cd "$(dirname "$0")"

# ── Flags ─────────────────────────────────────────────────────────────────────
NON_INTERACTIVE=false
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=true ;;
    --force)           FORCE=true ;;
    --help|-h)
      echo "Usage: ./setup.sh [--non-interactive] [--force]"
      echo "  --non-interactive  Read answers from setup.answers.yml"
      echo "  --force            Overwrite existing output files"
      exit 0
      ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
ANSWERS_FILE="setup.answers.yml"

# Read a value from setup.answers.yml by key (simple key: value YAML)
yml_get() {
  local key="$1"
  grep -E "^${key}:" "$ANSWERS_FILE" 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"'"'"
}

# Prompt or read from answers file
ask() {
  local key="$1"
  local prompt="$2"
  local default="${3:-}"
  if $NON_INTERACTIVE; then
    local val
    val="$(yml_get "$key")"
    if [[ -z "$val" && -n "$default" ]]; then
      val="$default"
    fi
    if [[ -z "$val" ]]; then
      echo "ERROR: Missing key '$key' in $ANSWERS_FILE" >&2
      exit 1
    fi
    echo "$val"
  else
    local display_prompt="$prompt"
    [[ -n "$default" ]] && display_prompt="$prompt [$default]"
    read -r -p "$display_prompt: " input
    echo "${input:-$default}"
  fi
}

# ── Non-interactive guard ─────────────────────────────────────────────────────
if $NON_INTERACTIVE && [[ ! -f "$ANSWERS_FILE" ]]; then
  echo "ERROR: --non-interactive requires $ANSWERS_FILE but it was not found." >&2
  exit 1
fi

# ── Gather answers ────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   AI Workflow Template — Setup Initializer   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

PROJECT_NAME="$(ask "project_name" "Project name (used in CLAUDE.md heading)" "My Project")"

NUM_CLUSTERS="$(ask "num_clusters" "Number of clusters (1–8)" "2")"
if ! [[ "$NUM_CLUSTERS" =~ ^[1-8]$ ]]; then
  echo "ERROR: num_clusters must be between 1 and 8." >&2
  exit 1
fi

# Collect cluster definitions
declare -a CLUSTER_IDS CLUSTER_PATHS CLUSTER_LABELS CLUSTER_COLORS
for i in $(seq 1 "$NUM_CLUSTERS"); do
  echo ""
  echo "── Cluster $i of $NUM_CLUSTERS ──"
  CLUSTER_IDS+=("$(ask "cluster_${i}_id"    "  id (e.g. backend)"          "cluster${i}")")
  CLUSTER_PATHS+=("$(ask "cluster_${i}_path"  "  path (e.g. backend/)"       "cluster${i}/")")
  CLUSTER_LABELS+=("$(ask "cluster_${i}_label" "  label (e.g. Backend API)"   "Cluster ${i}")")
  CLUSTER_COLORS+=("$(ask "cluster_${i}_color" "  color hex (e.g. #4A90D9)"   "#4A90D9")")
done

AI_TOOL="$(ask "ai_tool" "AI tool [kiro|cursor|claude-desktop|skip]" "skip")"

# ── Write cluster-config.json ─────────────────────────────────────────────────
CLUSTER_JSON="cluster-config.json"
if [[ -f "$CLUSTER_JSON" && -s "$CLUSTER_JSON" ]] && ! $FORCE; then
  echo ""
  echo "⚠  $CLUSTER_JSON already exists — skipping (use --force to overwrite)."
else
  {
    echo '{'
    echo '  "clusters": ['
    for i in $(seq 1 "$NUM_CLUSTERS"); do
      idx=$((i - 1))
      comma=""
      [[ $i -lt $NUM_CLUSTERS ]] && comma=","
      echo "    { \"id\": \"${CLUSTER_IDS[$idx]}\", \"path\": \"${CLUSTER_PATHS[$idx]}\", \"label\": \"${CLUSTER_LABELS[$idx]}\", \"color\": \"${CLUSTER_COLORS[$idx]}\" }${comma}"
    done
    echo '  ]'
    echo '}'
  } > "$CLUSTER_JSON"
  echo "✓  Written: $CLUSTER_JSON"
fi

# ── Write .env.mcp ────────────────────────────────────────────────────────────
ENV_FILE=".env.mcp"
if [[ -f "$ENV_FILE" ]] && ! $FORCE; then
  echo "⚠  $ENV_FILE already exists — skipping (use --force to overwrite)."
else
  cp ".env.mcp.example" "$ENV_FILE"
  echo "✓  Written: $ENV_FILE (copied from .env.mcp.example)"
fi

# ── Copy AI tool config ───────────────────────────────────────────────────────
TEMPLATES_DIR="services/mcp-context-manager"
case "$AI_TOOL" in
  kiro)
    mkdir -p ".kiro"
    DEST=".kiro/mcp.json"
    SRC="$TEMPLATES_DIR/kiro-config.template.json"
    ;;
  cursor)
    mkdir -p ".cursor"
    DEST=".cursor/mcp.json"
    SRC="$TEMPLATES_DIR/cursor-config.template.json"
    ;;
  claude-desktop)
    OS="$(uname -s)"
    case "$OS" in
      Darwin) DEST="$HOME/Library/Application Support/Claude/claude_desktop_config.json" ;;
      Linux)  DEST="$HOME/.config/Claude/claude_desktop_config.json" ;;
      *)      DEST="$APPDATA/Claude/claude_desktop_config.json" ;;
    esac
    mkdir -p "$(dirname "$DEST")"
    SRC="$TEMPLATES_DIR/claude-desktop-config.template.json"
    ;;
  skip)
    SRC=""
    DEST=""
    echo "⚠  AI tool config skipped. Run manually — see services/mcp-context-manager/AI-TOOL-CONFIGS.md"
    ;;
  *)
    echo "ERROR: Unknown ai_tool value '$AI_TOOL'. Choose: kiro, cursor, claude-desktop, skip" >&2
    exit 1
    ;;
esac

if [[ -n "$SRC" && -n "$DEST" ]]; then
  if [[ ! -f "$SRC" ]]; then
    echo "ERROR: Template not found: $SRC" >&2
    exit 1
  fi
  if [[ -f "$DEST" ]] && ! $FORCE; then
    echo "⚠  $DEST already exists — skipping (use --force to overwrite)."
  else
    cp "$SRC" "$DEST"
    echo "✓  Written: $DEST"
  fi
fi

# ── Update CLAUDE.md heading ──────────────────────────────────────────────────
if grep -q "^# AI Workflow Template" CLAUDE.md 2>/dev/null; then
  # Use a temp file to avoid in-place sed portability issues
  sed "s/^# AI Workflow Template/# ${PROJECT_NAME}/" CLAUDE.md > CLAUDE.md.tmp
  mv CLAUDE.md.tmp CLAUDE.md
  echo "✓  Updated CLAUDE.md heading to: # ${PROJECT_NAME}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║              Setup complete ✓                ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Review cluster-config.json and adjust paths if needed."
echo "  2. Edit .env.mcp to set WORKSPACE_PATH and any custom glob patterns."
echo "  3. Fill in the Domain Mappings table in CLAUDE.md."
echo "  4. Run: ./mcp.sh build && ./mcp.sh up"
echo "  5. Verify: curl http://localhost:3001/api/v1/health"
echo ""
