#!/usr/bin/env bash
# attach.sh — attach the AI workflow to a new codebase
# Usage: ./attach.sh /path/to/target-codebase

set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:-}"

if [[ -z "$TARGET_DIR" ]]; then
  echo "Usage: ./attach.sh /path/to/target-codebase"
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "✗ Directory not found: $TARGET_DIR"
  exit 1
fi

echo "→ Attaching AI workflow to: $TARGET_DIR"

cp -r "$TEMPLATE_DIR/.claude" "$TARGET_DIR/"
cp "$TEMPLATE_DIR/CLAUDE.md" "$TARGET_DIR/"

echo "✓ Done. Now open Claude in $TARGET_DIR and run:"
echo ""
echo "   Adopt the codebase_explorer persona."
echo ""
echo "It will clean stale state, explore the codebase, update CLAUDE.md, and prepare the architect."
