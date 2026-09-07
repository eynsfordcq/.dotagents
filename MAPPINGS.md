# Agent Configuration Mappings

This repository is the single source of truth for:

- Global instructions: `AGENTS.md`
- Global skills: `.agents/skills/`

All agents connect to this repository through symlinks (`~/.agents`).

---

## Link Architecture

```text
Repository (Source of Truth)
├── AGENTS.md ──> ~/.agents/AGENTS.md ──┬──> ~/.claude/CLAUDE.md
│                                       ├──> ~/.codex/AGENTS.md
│                                       ├──> ~/.config/opencode/AGENTS.md
│                                       ├──> ~/.pi/agent/AGENTS.md
│                                       ├──> ~/.gemini/GEMINI.md (Antigravity)
│                                       └──> (GitHub Copilot reads ~/.agents/AGENTS.md)
│
└── .agents/skills/ ──> ~/.agents/skills ──┬──> ~/.claude/skills
                                        ├──> ~/.gemini/config/skills (Antigravity)
                                        ├──> (Codex reads ~/.agents/skills)
                                        ├──> (OpenCode reads ~/.agents/skills)
                                        ├──> (Pi reads ~/.agents/skills)
                                        └──> (GitHub Copilot reads ~/.agents/skills)
```

---

## Global Scope

| Agent | Global Skills Path | Global Instructions Path | MCP Config Path |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `~/.claude/skills` (symlink) | `~/.claude/CLAUDE.md` (symlink) | `~/.claude.json` |
| **Codex** | `~/.agents/skills` (native) | `~/.codex/AGENTS.md` (symlink) | `~/.codex/config.toml` |
| **OpenCode** | `~/.agents/skills` (native) | `~/.config/opencode/AGENTS.md` (symlink) | `~/.config/opencode/opencode.json` |
| **Pi** | `~/.agents/skills` (native) | `~/.pi/agent/AGENTS.md` (symlink) | `~/.config/mcp/mcp.json` |
| **GitHub Copilot** | `~/.agents/skills` (native) | `~/.agents/AGENTS.md` (native) | `~/.config/github-copilot/mcp.json` |
| **Antigravity** | `~/.gemini/config/skills` (symlink) | `~/.gemini/GEMINI.md` (symlink) | `~/.gemini/antigravity/mcp/` |

---

## Per-Repo Scope

| Agent | Project Skills Path | Project Instructions Path | Project MCP Path |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `.claude/skills` (symlink) | `CLAUDE.md` (symlink) | `.mcp.json` |
| **Codex** | `.agents/skills` (native) | `AGENTS.md` (native) | `.codex/config.toml` |
| **OpenCode** | `.opencode/skills` (symlink) | `AGENTS.md` (native) | `opencode.json` |
| **Pi** | `.agents/skills` (native) | `AGENTS.md` (native) | `.mcp.json` |
| **GitHub Copilot** | `.agents/skills` (native) | `AGENTS.md` (or `.github/copilot-instructions.md`) | `.vscode/mcp.json` |
| **Antigravity** | `.agents/skills` (native) | `AGENTS.md` (native) | `.agents/mcp_config.json` |
