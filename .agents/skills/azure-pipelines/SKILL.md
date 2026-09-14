---
name: azure-pipelines
description: Design, debug, or review Azure Pipelines YAML and Classic-to-YAML migrations.
metadata:
  source:
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/?view=azure-devops
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/?view=azure-pipelines
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/process/runs?view=azure-devops
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/process/templates?view=azure-devops
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/process/approvals?view=azure-devops
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/process/environments?view=azure-devops
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/library/variable-groups?view=azure-devops
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/library/secure-files?view=azure-devops
    - https://learn.microsoft.com/en-us/azure/devops/pipelines/security/resources?view=azure-devops
---

# Azure Pipelines (YAML only)

Use Microsoft Learn as the source of truth. Treat blog posts, forum answers, and copied snippets as inspiration only.

## Scope

- In scope: YAML pipelines, Azure Pipelines process behavior, client-specific CI/CD design, migration from Classic to YAML, and review/debugging of `azure-pipelines.yml`.
- Out of scope: Classic build/release implementation except when explaining migration or compatibility.
- Out of scope: code style, formatting, lint rules, or language-specific test design that belongs to formatter/linter/test skills.

## Client-first stance

We implement Azure Pipelines for clients, not for our own standard platform. Do not assume a default Azure DevOps organization, repository type, runner model, cloud subscription, release governance, or security posture.

Start by identifying or stating assumptions about:

- Azure DevOps Services vs Azure DevOps Server version.
- Repository host: Azure Repos Git, GitHub, Bitbucket Cloud, or other.
- Agent model: Microsoft-hosted, self-hosted, container jobs, private network access, and OS requirements.
- Client governance: branch policies, approvals, segregation of duties, audit requirements, release windows, and production gates.
- Secret and identity model: service connections, managed identities, variable groups, Key Vault, secure files, and who administers protected resources.
- Deployment targets: Azure resources, Kubernetes, VMs, on-prem/private network, third-party SaaS, or artifact-only release.
- Required compatibility with existing Classic pipelines or shared templates.

When information is missing, make the smallest useful assumption and call it out explicitly in the answer.

## Core workflow

1. Classify the pipeline intent:
   - CI only.
   - Release on tag.
   - CD to staging/prod.
   - Artifact producer consumed by another pipeline.
   - Migration from Classic.
   - Shared template platform for client teams.
2. Design run creation first:
   - `trigger`, `pr`, `schedules`, and resource triggers.
   - Account for repository type; YAML `pr` triggers do not cover Azure Repos Git PR validation.
   - Avoid accidental duplicate runs from mixed trigger/resource types.
3. Model execution graph:
   - Stages (sequential by default), jobs (parallel by default), step order (sequential).
   - Use `dependsOn` and `condition` where business flow or failure handling matters.
4. Decide parameter/variable strategy:
   - Use typed parameters for template structure and queue-time choices.
   - Use variables for runtime values.
   - Use protected stores for secrets; never put secrets in YAML.
5. Add reuse safely:
   - Prefer templates over copy/paste once multiple pipelines share behavior.
   - Use `extends` templates when the client needs enforced structure.
   - Use typed template parameters; avoid stringly typed booleans.
6. Design artifact flow explicitly:
   - Publish once, download where needed.
   - Remember auto-download behavior in deployment jobs.
7. Add deployment governance:
   - Use deployment jobs and environments for real deployments.
   - Put approvals/checks on resources, not in YAML.
   - Locking strategy (`lockBehavior`) when overlap risk exists.
8. Validate failure behavior:
   - Conditions, cancellation semantics, retries, timeouts, `always()` cleanup, and rollback/cleanup hooks.
9. Review security posture:
   - Resource authorization, service connections, agent pools, variable groups, secure files, repository resources, and environment permissions.
10. Keep YAML readable and modular:

- Small composable templates and clear stage/job naming.
- Avoid clever expressions where a client maintainer will struggle to debug them.

## Run-sequence model (critical)

When explaining "why this didn't resolve":

- Template expansion and template expressions happen early.
- Resource authorization happens before stage execution.
- Runtime variables do not exist during template parsing.
- Step-level values set during runtime cannot influence earlier compile-time decisions.

For full details and caveats, read:

- `references/core.md` (processing order, expressions, variables, templates)

## Reference map

Read only what the task needs:

- `references/core.md`: syntax, lifecycle, stages/jobs/steps, tasks, templates, parameters, expressions, variables/groups, resources/library/secure files, triggers, approvals/checks, deployments, artifacts, and security review points.
- `references/patterns.md`: ready-to-adapt YAML examples for:
  - CI only.
  - Release on tag (build/test/release compiled binary artifact).
  - CD to staging and production (with and without manual prod gate).
  - Pipeline completion triggers and schedule-only pipelines.

## Organization practice

### Client discovery

- Ask for the client's repo host, agent model, environments, secret source, and release governance before designing CD.
- If the answer is unavailable, document the assumption beside the YAML or in the response.
- Preserve client naming and operational conventions unless they create risk.
- Do not introduce Azure-specific resources or governance mechanisms without confirming the client uses Azure DevOps for that responsibility.

### Pipeline control

- Do not rely on implied triggers. Set `trigger`, `pr`, `schedules`, and resource triggers intentionally.
- For Azure Repos Git PR validation, design around branch policies rather than YAML `pr` triggers.
- Treat scheduled trigger times as UTC and name schedules when conditions depend on schedule identity.
- Check whether UI-defined triggers/schedules exist before assuming YAML is the only source of run creation.

### Reuse and templates

- Use YAML templates for reuse; Task Groups are Classic-only.
- Prefer `extends` templates when clients need a controlled pipeline contract.
- Pin shared template repositories to a stable branch, tag, or commit based on the client's change-control model.
- Keep templates small enough that a client maintainer can trace the final graph without spelunking through excessive nesting.

### Variables and secrets

- Use parameters for typed structural decisions and variables for runtime values.
- Treat variables as mutable strings.
- Do not use parameters for secrets.
- Keep secrets in variable groups, Key Vault-backed variable groups, UI secret variables, secure files, or service connections.
- Map secret variables explicitly into `env:` when a script needs them.
- Verify variable groups, secure files, service connections, environments, repositories, and agent pools are authorized for the pipeline.

### Deployments

- Use deployment jobs and environments for CD when deployment history, traceability, or approvals matter.
- Configure approvals/checks on protected resources in Azure DevOps UI; do not pretend they live in YAML.
- Use environment/resource permissions to match the client's release ownership model.
- Use exclusive locks/`lockBehavior` when overlapping deploys can corrupt state or violate release controls.

### Failure behavior

- Remember that `condition` replaces the default success condition; include `succeeded()` where prior success is required.
- Add timeouts to jobs that can hang on external systems.
- Use retries only for operations that are safe to repeat.
- Put cleanup in explicit `always()` paths or deployment hooks where needed.
- Model artifact publish/download paths explicitly, especially across stages and deployment jobs.

## Common pitfalls to catch

- Assuming Azure Repos and GitHub trigger behavior are identical.
- Mixing CI, PR, schedule, and pipeline completion triggers without checking duplicate runs.
- Referencing runtime variables from template expressions or resource names that must be authorized before runtime.
- Using variables for booleans or structured template decisions instead of typed parameters.
- Forgetting that secret variables are not automatically environment variables.
- Granting broad open access to protected resources because the first run failed authorization.
- Putting manual approvals in YAML comments instead of configuring resource checks.
- Using normal jobs for deployments that should produce environment history.
- Letting deployment jobs auto-download artifacts unintentionally.
- Treating Classic Task Groups as reusable YAML building blocks.
- Copying marketplace task examples without checking task major version, permissions, and service connection behavior.

## Output expectations

When drafting or reviewing Azure Pipelines YAML:

- State assumptions: repo type, Azure DevOps hosting/version, agent model, trigger model, environments, approvals, secret stores, and service connections.
- Provide minimal but complete YAML snippets.
- Call out timing-sensitive decisions (compile-time vs runtime).
- Highlight authorization dependencies: variable groups, secure files, service connections, environments, repositories, and agent pools.
- Prefer robust, deterministic behavior over clever but brittle expressions.
- Separate Azure Pipelines design feedback from formatter/linter feedback.
