#!/bin/bash
# Sync global instructions, skills, pi keybindings, and pi zentui to every agent location (see MAPPINGS.md).
#
# This repo is the single source of truth. Each target becomes a symlink:
#   AGENTS.md -> ~/.agents/AGENTS.md -> agent paths (CLAUDE.md, AGENTS.md, GEMINI.md)
#   .agents/skills/ -> ~/.agents/skills -> ~/.claude/skills, ~/.gemini/config/skills
#   keybindings.json -> ~/.pi/agent/keybindings.json (pi only, optional)
#   .pi/zentui.json -> ~/.pi/agent/zentui.json (pi only, optional)
# Agents that read ~/.agents natively (Codex, OpenCode, Pi, Copilot)
# need no extra link. Antigravity global skills live in
# ~/.gemini/config/skills, so they need a link.
#
# Existing targets are removed first, so stale copies disappear.
# .agents/skills/ holds first-party skills plus npx-installed third-party
# skills side by side. Both sync as one.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC_AGENTS="$ROOT/AGENTS.md"
SRC_SKILLS="$ROOT/.agents/skills"
SRC_KEYBINDINGS="$ROOT/.pi/keybindings.json"
SRC_ZENTUI="$ROOT/.pi/zentui.json"
HUB_AGENTS="$HOME/.agents/AGENTS.md"
HUB_SKILLS="$HOME/.agents/skills"

if [[ ! -f "$SRC_AGENTS" ]]; then
  echo "error: missing $SRC_AGENTS" >&2
  exit 1
fi
if [[ ! -d "$SRC_SKILLS" ]]; then
  echo "error: missing $SRC_SKILLS" >&2
  exit 1
fi
# Pi-only settings below are optional: each links only when present in ./.pi/.

link() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  ln -s "$src" "$dst"
  echo "linked $dst -> $src"
}

# Hub first. Agent paths below point at the hub.
link "$SRC_AGENTS" "$HUB_AGENTS"
link "$SRC_SKILLS" "$HUB_SKILLS"

# Global instructions. Copilot reads the hub natively, so no link for it.
link "$HUB_AGENTS" "$HOME/.claude/CLAUDE.md"
link "$HUB_AGENTS" "$HOME/.codex/AGENTS.md"
link "$HUB_AGENTS" "$HOME/.config/opencode/AGENTS.md"
link "$HUB_AGENTS" "$HOME/.pi/agent/AGENTS.md"
link "$HUB_AGENTS" "$HOME/.gemini/GEMINI.md"

# Global skills. Claude Code and Antigravity need links. The rest read the hub natively.
link "$HUB_SKILLS" "$HOME/.claude/skills"
link "$HUB_SKILLS" "$HOME/.gemini/config/skills"

# Pi-only settings (optional: link only when the source exists in ./.pi/).
if [[ -f "$SRC_KEYBINDINGS" ]]; then
  link "$SRC_KEYBINDINGS" "$HOME/.pi/agent/keybindings.json"
else
  echo "skip keybindings.json (missing $SRC_KEYBINDINGS)"
fi

if [[ -f "$SRC_ZENTUI" ]]; then
  link "$SRC_ZENTUI" "$HOME/.pi/agent/zentui.json"
else
  echo "skip zentui.json (missing $SRC_ZENTUI)"
fi

echo "Done."
