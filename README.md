# Agent Skills

This repository contains our organization's self-maintained agent skills, which provide domain-specific standards and best practices for AI coding agents.

## What are Agent Skills?

A simple, open format for giving agents new capabilities and expertise.

Agent Skills are folders of instructions, scripts, and resources that agents can discover and use to do things more accurately and efficiently.

### Why Agent Skills?

Agents are increasingly capable, but often don't have the context they need to do real work reliably. Skills solve this by giving agents access to procedural knowledge and company-, team-, and user-specific context they can load on demand. Agents with access to a set of skills can extend their capabilities based on the task they're working on.

- **For skill authors**: Build capabilities once and deploy them across multiple agent products.
- **For compatible agents**: Support for skills lets end users give agents new capabilities out of the box.
- **For teams and enterprises**: Capture organizational knowledge in portable, version-controlled packages.

### What can Agent Skills enable?

- **Domain expertise**: Package specialized knowledge into reusable instructions, from legal review processes to data analysis pipelines.
- **New capabilities**: Give agents new capabilities (e.g. creating presentations, building MCP servers, analyzing datasets).
- **Repeatable workflows**: Turn multi-step tasks into consistent and auditable workflows.
- **Interoperability**: Reuse the same skill across different skills-compatible agent products.

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
npx skills add <current-repo> --skill pytest -g
```

### Agent Configuration

We use **GitHub Copilot** as our primary agent. When adding skills, select the appropriate agent:

- Use `-g` for **global installation** (recommended - setup once for all projects)
- Omit `-g` for project-specific installation

> **Note:** GitHub Copilot falls under the `universal` agent category (`~/.agents/skills`) in the skills CLI. Make sure `~/.agents/skills` is set to `true` in **Chat: Agent Skills Locations** in VS Code Settings.
>
> Versions before **1.109.2** had an issue where GitHub Copilot didn't read from the universal directory. If you're using an older version, add `-a github-copilot` to the command above and choose **"copy to agent"** instead of **"symlink"** when prompted (or symlink manually).

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
