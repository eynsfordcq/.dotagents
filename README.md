# Agent Skills

This repo holds our global agent instructions (`AGENTS.md`), our skills (`.agents/skills/`, first-party plus npx-vendored third-party with `skills-lock.json` pins), `sync-global.sh` which symlinks both to every agent location, and reusable prompts in `prompts/`. See [`MAPPINGS.md`](MAPPINGS.md) for where everything links.

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
