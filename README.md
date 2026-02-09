# Agent Skills

This repository contains our organization's self-maintained agent skills, which provide domain-specific standards and best practices for AI coding agents.

## What are Agent Skills?

Agent skills are domain-specific instructions that help AI coding agents understand your organization's standards, patterns, and best practices. They act as contextual knowledge that agents can reference when assisting with code.

Learn more at [https://agentskills.io/home](https://agentskills.io/home)

## Management

We use the `npx skills` CLI tool to manage our agent skills. For more information, visit [https://github.com/vercel-labs/skills](https://github.com/vercel-labs/skills)

### CLI Reference

```bash
npx skills --help
```

## Using Skills from This Repository

To add a skill from this repository:

```bash
npx skills add <current-repo> --skill pytest -a github-copilot -g
```

### Agent Configuration

We use **GitHub Copilot** as our primary agent. When adding skills, select the appropriate agent:

- Use `-g` for **global installation** (recommended - setup once for all projects)
- Omit `-g` for project-specific installation

> **Note:** As of now, GitHub Copilot falls under the `universal` agent category (`~/.agent`) in skills, but GitHub Copilot itself doesn't seem to read from that directory yet. For now, **choose "copy to agent" instead of "symlink"** when prompted. (Or do symlink manually)

### Installation Scope

- **Global (`-g`)**: Recommended for organization-wide standards. Set up once and use across all projects.
- **Project-specific**: Leave this to the lead developer for each project to manage project-specific skills.

## Contributing

To create a new skill:

1. Initialize a new skill:

   ```bash
   npx skills init skills/<skill-name>
   ```

2. Edit the generated `SKILL.md` file with your skill's content

3. Follow the skill specification conventions: [https://agentskills.io/specification](https://agentskills.io/specification)

---

For questions or contributions, please reach out to your team lead.
