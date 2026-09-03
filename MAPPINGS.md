# Coding Agent Configuration Mappings

This document lists the configuration locations for four AI coding agents:

1. **Claude Code**
2. **Codex (OpenAI)**
3. **OpenCode**
4. **Pi (Earendil Works)**

Each agent is organized across two scopes:

- **Global scope** (user-level, applies across all projects)
- **Per-repo scope** (project-level, applies to a specific repository)

---

## Quick Reference Table

### Global Scope

| Agent | Skills Location | Instructions File | MCP Configuration |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `~/.claude/skills/` | `~/.claude/CLAUDE.md` | `~/.claude.json` |
| **Codex** | `~/.codex/skills/` or `~/.agents/skills/` | `~/.codex/AGENTS.md` | `~/.codex/config.toml` |
| **OpenCode** | `~/.config/opencode/skills/` or `~/.agents/skills/` | `~/.config/opencode/AGENTS.md` | `~/.config/opencode/opencode.json` |
| **Pi** | `~/.pi/agent/skills/` or `~/.agents/skills/` | `~/.pi/agent/AGENTS.md` | `~/.config/mcp/mcp.json` or `~/.pi/agent/settings.json` |

---

### Per-Repo Scope

| Agent | Skills Location | Instructions File | MCP Configuration |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `.claude/skills/` | `CLAUDE.md` or `.claude/CLAUDE.md` | `.mcp.json` (shared) or `~/.claude.json` (local override) |
| **Codex** | `.codex/skills/` or `.agents/skills/` | `AGENTS.md` or `.codex/AGENTS.md` | `.codex/config.toml` |
| **OpenCode** | `.opencode/skills/` | `AGENTS.md` or `.opencode/AGENTS.md` | `opencode.json` or `.opencode/opencode.json` |
| **Pi** | `.pi/skills/` or `.agents/skills/` | `AGENTS.md` or `CLAUDE.md` | `.mcp.json` (with MCP adapter) |

---

## 1. Claude Code

### Global Scope

- **Skills Directory:**
  - Path: `~/.claude/skills/<skill-name>/SKILL.md`
  - Skills placed here are accessible across all projects.

- **Instructions File:**
  - Path: `~/.claude/CLAUDE.md`
  - Contains user-wide instructions and rules.

- **MCP Configuration:**
  - Path: `~/.claude.json`
  - Servers are listed under the top-level `mcpServers` object.
  - Add via CLI:

    ```bash
    claude mcp add --scope user <name> <commandOrUrl>
    ```

### Per-Repo Scope

- **Skills Directory:**
  - Path: `.claude/skills/<skill-name>/SKILL.md`
  - Checked into Git to share with collaborators.

- **Instructions File:**
  - Primary path: `CLAUDE.md` (at repo root).
  - Alternative path: `.claude/CLAUDE.md`.
  - Local private override: `CLAUDE.local.md` (add to `.gitignore`).
  - Hierarchical loading: Claude Code also checks subdirectories as you navigate.

- **MCP Configuration:**
  - Shared path: `.mcp.json` (at repo root, committed to Git).
  - Add shared server via CLI:

    ```bash
    claude mcp add --scope project <name> <commandOrUrl>
    ```

  - Local private path: stored in `~/.claude.json` under `projects.<path>.mcpServers`.
  - Add private server via CLI:

    ```bash
    claude mcp add --scope local <name> <commandOrUrl>
    ```

---

## 2. Codex (OpenAI)

### Global Scope

- **Skills Directory:**
  - Path: `~/.codex/skills/<skill-name>/SKILL.md`
  - Standard fallback: `~/.agents/skills/<skill-name>/SKILL.md`

- **Instructions File:**
  - Path: `~/.codex/AGENTS.md`
  - Applies base guidelines to all Codex runs.

- **MCP Configuration:**
  - Path: `~/.codex/config.toml`
  - Written in TOML format under `[mcp_servers]`:

    ```toml
    [mcp_servers.my-server]
    command = "npx"
    args = ["-y", "my-mcp-server"]
    ```

  - Add via CLI:

    ```bash
    codex mcp add <name> -- <command>
    ```

### Per-Repo Scope

- **Skills Directory:**
  - Path: `.codex/skills/<skill-name>/SKILL.md`
  - Standard fallback: `.agents/skills/<skill-name>/SKILL.md`

- **Instructions File:**
  - Primary path: `AGENTS.md` (at repo root).
  - Alternative path: `.codex/AGENTS.md`.
  - Hierarchical loading: Codex traverses upward from the current directory and merges `AGENTS.md` files.

- **MCP Configuration:**
  - Path: `.codex/config.toml`
  - Overrides global settings for the repository.

---

## 3. OpenCode

### Global Scope

- **Skills Directory:**
  - Primary path: `~/.config/opencode/skills/<skill-name>/SKILL.md`
  - Auto-loaded external paths: `~/.agents/skills/<skill-name>/SKILL.md` and `~/.claude/skills/<skill-name>/SKILL.md` (OpenCode automatically discovers skills in both without extra configuration).

- **Instructions File:**
  - Path: `~/.config/opencode/AGENTS.md`
  - Fallback path: `~/.claude/CLAUDE.md`.

- **MCP Configuration:**
  - Path: `~/.config/opencode/opencode.json` (or `opencode.jsonc`).
  - Defined inside the `"mcp"` configuration block:

    ```json
    {
      "mcp": {
        "my-server": {
          "type": "local",
          "command": ["npx", "-y", "my-mcp-server"],
          "enabled": true
        }
      }
    }
    ```

### Per-Repo Scope

- **Skills Directory:**
  - Path: `.opencode/skills/<skill-name>/SKILL.md`

- **Instructions File:**
  - Primary path: `AGENTS.md` (at repo root).
  - Alternative path: `.opencode/AGENTS.md`.
  - Can be generated or updated using the `/init` command.

- **MCP Configuration:**
  - Primary path: `opencode.json` (in repo root).
  - Alternative path: `.opencode/opencode.json`.
  - Add via CLI:

    ```bash
    opencode mcp add <name>
    ```

---

## 4. Pi (Earendil Works)

### Global Scope

- **Skills Directory:**
  - Primary path: `~/.pi/agent/skills/<skill-name>/SKILL.md`
  - Native auto-discovery: `~/.agents/skills/<skill-name>/SKILL.md` (Pi natively discovers global skills here).

- **Instructions File:**
  - Path: `~/.pi/agent/AGENTS.md`
  - Fallback path: `~/.pi/agent/CLAUDE.md`.

- **MCP Configuration:**
  - Path: `~/.config/mcp/mcp.json` or `~/.pi/agent/settings.json` (used by extensions like `pi-mcp-adapter`).

### Per-Repo Scope

- **Skills Directory:**
  - Primary path: `.pi/skills/<skill-name>/SKILL.md`
  - Native auto-discovery: `.agents/skills/<skill-name>/SKILL.md` (discovered in `cwd` and parent directories up to git root).

- **Instructions File:**
  - Primary path: `AGENTS.md` (at repo root).
  - Fallback path: `CLAUDE.md`.
  - Alternative path: `.pi/AGENTS.md`.
  - Override path: `AGENTS.override.md` (overrides `AGENTS.md` for that folder).

- **MCP Configuration:**
  - Path: `.mcp.json` (at repo root).
  - Loaded by extensions like `pi-mcp-adapter`.

## Standardizing on `AGENTS.md` and `~/.agents/`

If you want one single standardized instruction file across all agents, use this strategy:

### 1. Per-Repo Scope (`AGENTS.md`)
- **Standard file:** `AGENTS.md` placed in the repository root.
- **Codex, OpenCode, Pi:** All read `AGENTS.md` natively at startup.
- **Claude Code:** Claude Code looks for `CLAUDE.md`.
  - Link it once per repo:
    ```bash
    ln -s AGENTS.md CLAUDE.md
    ```
  - Or import inside `CLAUDE.md`:
    ```markdown
    @AGENTS.md
    ```

### 2. Global Scope (`~/.agents/AGENTS.md`)
- **Standard file:** Create your master global rules at `~/.agents/AGENTS.md`.
- **Agent native paths:**
  - Claude Code expects: `~/.claude/CLAUDE.md`
  - Codex expects: `~/.codex/AGENTS.md`
  - OpenCode expects: `~/.config/opencode/AGENTS.md`
  - Pi expects: `~/.pi/agent/AGENTS.md`
- **One-time symlink setup:**
  Point each agent's native path to `~/.agents/AGENTS.md`:
  ```bash
  mkdir -p ~/.agents ~/.claude ~/.codex ~/.config/opencode ~/.pi/agent

  ln -sf ~/.agents/AGENTS.md ~/.claude/CLAUDE.md
  ln -sf ~/.agents/AGENTS.md ~/.codex/AGENTS.md
  ln -sf ~/.agents/AGENTS.md ~/.config/opencode/AGENTS.md
  ln -sf ~/.agents/AGENTS.md ~/.pi/agent/AGENTS.md
  ```
  All four agents will now read from the single `~/.agents/AGENTS.md` file.

---

## Summary of Universal Conventions

- **Skills:** `~/.agents/skills/` (global) and `.agents/skills/` (per-repo) serve as the shared industry convention across multi-agent tools.
- **Rules / Context:** `AGENTS.md` at repository root is the open standard. Symlink `CLAUDE.md -> AGENTS.md` for Claude Code.
- **Global Rules:** Standardize on `~/.agents/AGENTS.md` and symlink to agent-specific directories.
- **MCP Config:** `.mcp.json` is the standard project-level format supported by Claude Code and Pi. OpenCode uses `opencode.json`, while Codex uses `.codex/config.toml`.
