---
name: readme
description: Create, update, or review a software project README.
metadata:
  categories:
    - documentation
    - markdown
  references:
    - https://github.com/softaworks/agent-toolkit/tree/main/skills/crafting-effective-readmes
---

# README work

A README helps its intended reader understand the project and perform the next useful action. Match its scope to the project. A library, service, CLI, and documentation repo need different sections.

Read the existing README and the files that establish the facts you need, such as manifests, scripts, example config, and CI files. Preserve useful project-specific information. Ask for missing facts only when the repo cannot establish them and guessing would make the instructions unsafe or misleading.

For a new README, include the project's purpose, prerequisites, setup, and use or test commands when they apply. Add architecture, deployment, support, and external links only when they help this project's readers. Do not invent commands, versions, environments, credentials, or organizational systems. Never put secret values in the README.

Check changed links and paths. Run safe local commands when they are needed to verify setup instructions. If a command needs unavailable services or credentials, say what remains unverified. Keep examples short and copyable.
