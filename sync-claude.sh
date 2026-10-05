#!/bin/bash
# Sync Claude Code mods and global settings (see MAPPINGS.md).
#
# This repo is the single source of truth:
#   .claude/mods/ -> ~/.claude/mods (symlink)
#   .claude/global-settings.json -> merged into ~/.claude/settings.json
#   each .claude/mods/<mod>/ -> listed in env.CLAUDE_CODE_PLUGIN_DIRS
#
# Claude Code loads each folder in CLAUDE_CODE_PLUGIN_DIRS as a plugin.
# The variable takes plugin folders, not a parent folder, so the script lists each mod.
# Keys that are not in global-settings.json stay as they are in ~/.claude/settings.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC_MODS="$ROOT/.claude/mods"
SRC_SETTINGS="$ROOT/.claude/global-settings.json"
DST_MODS="$HOME/.claude/mods"
DST_SETTINGS="$HOME/.claude/settings.json"

if ! command -v jq >/dev/null; then
  echo "error: jq is required" >&2
  exit 1
fi
if [[ ! -f "$SRC_SETTINGS" ]]; then
  echo "error: missing $SRC_SETTINGS" >&2
  exit 1
fi

mkdir -p "$SRC_MODS" "$HOME/.claude"
rm -rf "$DST_MODS"
ln -s "$SRC_MODS" "$DST_MODS"
echo "linked $DST_MODS -> $SRC_MODS"

# A mod is a folder with .claude-plugin/plugin.json.
dirs=()
shopt -s nullglob
for mod in "$SRC_MODS"/*/; do
  mod="${mod%/}"
  if [[ -f "$mod/.claude-plugin/plugin.json" ]]; then
    dirs+=("$DST_MODS/$(basename "$mod")")
    echo "mod $(basename "$mod")"
  fi
done
plugin_dirs="$(IFS=:; echo "${dirs[*]-}")"

[[ -f "$DST_SETTINGS" ]] || echo '{}' >"$DST_SETTINGS"
tmp="$(mktemp)"
jq --slurpfile src "$SRC_SETTINGS" --arg dirs "$plugin_dirs" '
  . * $src[0]
  | if $dirs == "" then del(.env.CLAUDE_CODE_PLUGIN_DIRS) else .env.CLAUDE_CODE_PLUGIN_DIRS = $dirs end
  | if .env == {} then del(.env) else . end
' "$DST_SETTINGS" >"$tmp"
mv "$tmp" "$DST_SETTINGS"
echo "merged $SRC_SETTINGS into $DST_SETTINGS"

echo "Done. Start a new session to load the changes."
