# Agent Skills

This repo holds our global agent instructions (`AGENTS.md`), our skills (`.agents/skills/`, first-party plus npx-vendored third-party with `skills-lock.json` pins), and `sync-global.sh` which symlinks both to every agent location. See [`MAPPINGS.md`](MAPPINGS.md) for where everything links.

Note: `prompts/` is legacy and no longer synced. Four prompts moved into skills (`gitlab-issue`, `orchestrator`, `read-only`, `task-breakdown`). Call them explicitly with `/skill-name`.

Add a third-party skill:

```bash
npx skills add <repo> --skill <name> -a universal
./sync-global.sh
```

Create a new first-party skill:

```bash
npx skills init .agents/skills/<skill-name>
```

Update all skills from the lockfile:

```bash
npx skills update
```

Commit the changed skill directories and `skills-lock.json`.

Pi packages (`pi-packages.txt`) are the global pi extension list. Install them:

```bash
./install-pi-packages.sh
```

Add or remove a package with `pi install` / `pi remove`, then update `pi-packages.txt` to match.
