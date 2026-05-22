#!/usr/bin/env bash
set -euo pipefail
# Copies the production build into a vault's .obsidian/plugins/ directory.
#
# Usage:
#   ./scripts/install-to-vault.sh /path/to/vault

VAULT="${1:-/home/vinh/Desktop/v_note/obsidian_note}"
PLUGIN_NAME="obsidian-latex-live"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$VAULT/.obsidian/plugins/$PLUGIN_NAME"

if [[ ! -d "$VAULT/.obsidian" ]]; then
  echo "Not a vault: $VAULT (missing .obsidian)" >&2
  exit 1
fi

mkdir -p "$DEST"
cp "$SRC_DIR/manifest.json" "$DEST/"
cp "$SRC_DIR/styles.css" "$DEST/"
if [[ -f "$SRC_DIR/dist/main.js" ]]; then
  cp "$SRC_DIR/dist/main.js" "$DEST/main.js"
else
  echo "No dist/main.js; run 'npm run build' first." >&2
  exit 1
fi
echo "Installed $PLUGIN_NAME → $DEST"
