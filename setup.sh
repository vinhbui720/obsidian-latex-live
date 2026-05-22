#!/usr/bin/env bash
set -euo pipefail

# One-command setup for obsidian-latex-live.
# - verifies required tools
# - installs npm dependencies
# - builds the plugin
# - installs main.js / manifest.json / styles.css into an Obsidian vault
#
# Usage:
#   ./setup.sh [vault_path]
#
# Examples:
#   ./setup.sh
#   ./setup.sh "/home/vinh/Desktop/v_note/obsidian_note"
#   VAULT="/path/to/Obsidian Vault" ./setup.sh

PLUGIN_ID="obsidian-latex-live"
DEFAULT_VAULT="/home/vinh/Desktop/v_note/obsidian_note"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT="${1:-${VAULT:-$DEFAULT_VAULT}}"
DEST="$VAULT/.obsidian/plugins/$PLUGIN_ID"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

bold "LaTeX Live for Obsidian setup"
info "Repo:  $ROOT_DIR"
info "Vault: $VAULT"

[[ -d "$VAULT/.obsidian" ]] || die "Not an Obsidian vault: $VAULT (missing .obsidian). Pass the vault path: ./setup.sh /path/to/vault"

have node || die "node is missing. Install Node.js first, e.g. sudo apt install nodejs npm"
have npm || die "npm is missing. Install npm first, e.g. sudo apt install npm"

# LaTeX tools are runtime requirements. We warn instead of failing because some
# users may want to install/build the plugin before installing TeX Live.
for cmd in latexmk lualatex synctex; do
  if ! have "$cmd"; then
    warn "$cmd not found. Runtime compile/synctex will not work until installed. Ubuntu: sudo apt install texlive-full"
  fi
done

cd "$ROOT_DIR"

if [[ -f package-lock.json ]]; then
  info "Installing npm dependencies with npm ci --legacy-peer-deps"
  npm ci --legacy-peer-deps
else
  info "Installing npm dependencies with npm install --legacy-peer-deps"
  npm install --legacy-peer-deps
fi

info "Type-checking"
npx tsc --noEmit

info "Building production bundle"
npm run build

[[ -f "$ROOT_DIR/dist/main.js" ]] || die "Build did not create dist/main.js"

info "Installing plugin into vault"
mkdir -p "$DEST"
cp "$ROOT_DIR/dist/main.js" "$DEST/main.js"
cp "$ROOT_DIR/manifest.json" "$DEST/manifest.json"
cp "$ROOT_DIR/styles.css" "$DEST/styles.css"

bold "Done"
echo "Installed to: $DEST"
echo "Next steps:"
echo "  1. Open/reload Obsidian (Ctrl+R)"
echo "  2. Settings -> Community plugins -> enable 'LaTeX Live'"
echo "  3. Open a .tex file, press Ctrl+S to compile, Ctrl+Shift+P to open preview"
