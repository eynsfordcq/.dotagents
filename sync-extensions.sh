#!/bin/bash
# Sync pi extensions to the global extensions directory.
#
# This repo is the single source of truth. Each extension becomes a symlink:
#   .pi/extensions/*.ts -> ~/.pi/agent/extensions/*.ts
#   .pi/extensions/<dir>/ (with index.ts) -> ~/.pi/agent/extensions/<dir>
#
# Existing targets are removed first, so stale copies disappear.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC_EXTENSIONS="$ROOT/.pi/extensions"
DST_EXTENSIONS="$HOME/.pi/agent/extensions"

if [[ ! -d "$SRC_EXTENSIONS" ]]; then
  echo "error: missing $SRC_EXTENSIONS" >&2
  exit 1
fi

# Clean first, so extensions deleted from the repo disappear globally.
rm -rf "$DST_EXTENSIONS"
mkdir -p "$DST_EXTENSIONS"

shopt -s nullglob
for src in "$SRC_EXTENSIONS"/*.ts; do
  dst="$DST_EXTENSIONS/$(basename "$src")"
  ln -s "$src" "$dst"
  echo "linked $dst -> $src"
done

for src in "$SRC_EXTENSIONS"/*/; do
  src="${src%/}"
  if [[ -f "$src/index.ts" ]]; then
    dst="$DST_EXTENSIONS/$(basename "$src")"
    ln -s "$src" "$dst"
    echo "linked $dst -> $src"
  fi
done

echo "Done."
