# Azure Pipelines YAML Core Reference

Source basis: Microsoft Learn Azure DevOps docs (YAML schema/process pages).

Use this reference for Azure Pipelines behavior that affects design choices. Do not put language formatting, code lint style, or unit-test design rules here.

## 0) Client discovery checklist

Before proposing YAML for a client, identify:

- Azure DevOps Services or Azure DevOps Server version.
- Repository host and branch policy model.
- Agent type, OS, network access, and whether jobs can run in containers.
- Deployment target and required environment history.
- Secret source: service connections, variable groups, Key Vault, secure files, UI secrets, or external vault.
- Protected resource administrators and approval/check owners.
- Existing Classic build/release pipelines, Task Groups, service connections, and shared templates.
- Audit, release-window, rollback, and segregation-of-duties requirements.

If any item is unknown, state the assumption in the response or in a nearby YAML comment only when it helps the client maintain the pipeline.

## 1) Basic syntax and top-level structure

Typical top-level keys include:

- `name`
- `trigger`
- `pr`
- `schedules`
- `parameters`
- `variables`
- `resources`
- `stages` or `jobs` (single implicit stage possible)
- `extends`

Notes:

- YAML pipelines do not support all YAML features (for example anchors/complex keys/sets are documented as unsupported).
- Prefer explicit structure and explicit triggers over defaults.

## 2) Stages, jobs, steps

Execution defaults:

- Stages run sequentially in declaration order unless dependencies are overridden.
- Jobs in a stage run in parallel unless `dependsOn` is set.
- Steps in a job run sequentially.
- A custom `condition` replaces default success behavior. Include `succeeded()` when prior success is still required.

Useful stage properties:

- `dependsOn`, `condition`, `trigger: manual`, `isSkippable`, `lockBehavior`.

Useful job properties:

- `dependsOn`, `condition`, `strategy` (matrix/parallel), `pool`, `timeoutInMinutes`, `cancelTimeoutInMinutes`, `workspace.clean`, `continueOnError`.

Step list supports:

- `task`, `script`, `bash`, `pwsh`, `powershell`, `checkout`, `download`, `downloadBuild`, `getPackage`, `publish`, `template`.

## 3) Run sequence and processing order

Run processing model (important for debugging):

1. Template expansion + template expression evaluation.
2. Stage dependency evaluation.
3. Resource authorization for stage/jobs.
4. Job dependency and condition evaluation.
5. Agent allocation.
6. Step execution sequentially per job.

Implications:

- Runtime variables are unavailable during template parse.
- You cannot use variables to resolve service connection/environment names during authorization.
- Stage/job-level vars are not available at authorization time.
- Resource authorization failures are design/configuration issues, not script failures; fix permissions, checks, resource names, or service connection references.

## 4) Tasks and task groups

Tasks:

- Reference as `TaskName@Major` (for example `PublishTestResults@2`).
- Pin major versions; minor versions can auto-update.
- Control behavior with `condition`, `continueOnError`, `retryCountOnTaskFailure`, `timeoutInMinutes`, `target`, `env`.
- Check marketplace/client-installed task availability before using non-built-in tasks.
- Keep scripts explicit when a task hides behavior the client needs to audit.

Task groups:

- Task Groups are Classic pipeline feature and not supported in YAML.
- For YAML reuse, use templates (`steps`, `jobs`, `stages`) and parameters.
- During migration, convert Task Groups into YAML templates rather than recreating them as Classic dependencies.

## 5) Templates, parameters, expressions

Template reuse:

- Include templates (`template:`) for steps/jobs/stages/variables.
- Extend templates (`extends:`) to enforce controlled structure.
- Put shared templates in a repository and ref that matches the client's change-control process.
- Use `extends` plus required-template checks for clients that need enforced governance.

Template limits:

- Includes and nesting have documented limits (file count, nesting depth, parse memory).
- Excessive nesting is also a maintainability risk; prefer templates that map to recognizable client workflows.

Parameters:

- Typed (`string`, `boolean`, `object`, `stepList`, `jobList`, `stageList`, and others).
- Evaluated at template parsing; immutable after queue.
- Not for secrets.
- Prefer parameters over variables for booleans, allowed values, stage/job inclusion, and template structure.

Expressions:

- Compile-time: `${{ }}` (has parameters + static variables).
- Runtime: `$[ ]` (for runtime variable/condition contexts).
- Conditions frequently use functions such as `succeeded()`, `failed()`, `always()`, `and()`, `eq()`, `in()`.

Common caveat:

- `condition` overrides defaults. If you want prior-success semantics, usually include `succeeded()` in custom conditions.
- Compile-time expressions (`${{ }}`) can use parameters and static variables; runtime expressions (`$[ ]`) are for runtime variable/condition contexts.

## 6) Variables and variable groups

Variable syntax options:

- Macro: `$(var)`
- Template expression: `${{ variables.var }}`
- Runtime expression: `$[variables.var]`

Scope precedence (highest first):

1. Job YAML
2. Stage YAML
3. Pipeline root YAML
4. Queue-time variable
5. Pipeline UI variable

Rules:

- Variables are strings.
- Naming restrictions apply (reserved prefixes like `secret`, `endpoint`, `path`, etc.).
- Secret variables should not be hardcoded in YAML.
- Secret vars are not automatically exported to env vars; map with `env:`.
- Avoid using variables as typed feature flags in templates. They are strings and can be changed at runtime.

Variable groups:

- Reusable project-level variable sets.
- Must be authorized for YAML pipelines.
- Secret variables in groups are protected resources.
- Group order matters when names collide (last one wins in file order).
- Avoid colliding variable names across groups. If unavoidable, document the intended precedence.
- For client projects, confirm whether variable group administration belongs to platform, security, or app teams before broadening access.

Output variables:

- Same job: `$(StepName.VarName)`
- Cross-job/stage: use `dependencies`/`stageDependencies` syntax.
- Deployment job output syntax varies by strategy/resource naming.

## 7) Library, resources, secure files

Library:

- Contains Variable Groups and Secure Files.
- Uses library security roles (Reader/User/Creator/Administrator).

Resources (`resources:`):

- Pipelines, builds, repositories, containers, packages, webhooks.
- Require authorization.
- Can trigger pipelines depending on resource type and trigger config.
- Protected resources include repositories, environments, service connections, agent pools, secure files, and secret variables in variable groups.
- Prefer explicit pipeline permissions over open access unless the client has approved that trade-off.

Secure files:

- Encrypted server-side; max size 10 MB.
- Protected resource with checks/permissions.
- Consume using `DownloadSecureFile@1`.
- Secure files cannot be edited in place; updating one means uploading a replacement and checking any filename references.

Service connections:

- Treat service connections as protected resources with owner-controlled permissions/checks.
- Confirm the authentication model with the client: workload identity federation, service principal secret/cert, managed identity, or other provider-specific identity.
- Do not hardcode subscription IDs, tenant IDs, or endpoint names without confirming they are stable client conventions.

## 8) Triggers

Trigger types to design intentionally:

- CI: `trigger`
- PR: `pr`
- Schedule: `schedules` / `schedules.cron`
- Pipeline completion: `resources.pipelines[].trigger`

Key caveats:

- YAML pipelines can have implied CI trigger unless org/project setting disables implied CI.
- YAML `pr` triggers are supported for GitHub/Bitbucket Cloud; Azure Repos Git uses branch policy for PR validation.
- Scheduled times are UTC; UI schedules can override YAML schedules.
- Combining CI + pipeline completion can create duplicate runs if not controlled.
- Scheduled triggers may expose `Build.CronSchedule.DisplayName`; use it when different schedules need different behavior.
- For client repos, verify whether branch policies, service hooks, or UI pipeline settings already create runs.

## 9) Approvals and checks

Approvals/checks are configured on resources, not in YAML.

Common checks:

- Manual approvals
- Branch control
- Required template
- Business hours
- Invoke REST API / Azure Function
- Query Azure Monitor alerts
- Evaluate artifact
- Exclusive lock

Execution model:

- All checks for all resources used by a stage must pass before stage starts.
- Terminal negative check decisions block stage execution.
- Check categories run in documented order.
- Resource owners, not pipeline authors, should own checks when segregation of duties matters.
- Required template checks can enforce that pipelines extend from an approved template.

## 10) Deployments and environments

Deployment jobs (`deployment:`) are preferred for deployment intent.

Benefits:

- Environment deployment history.
- Strategies: `runOnce`, `rolling` (VM-focused), `canary`.
- Lifecycle hooks: `preDeploy`, `deploy`, `routeTraffic`, `postRouteTraffic`, `on: success/failure`.
- Traceability to commits and work items when Azure DevOps has the relevant data.

Important behavior:

- Artifact download is auto-injected only in deployment job `deploy` hook; override with `download: none` if needed.
- Environment/resource targeting can auto-inherit connection details for relevant tasks.
- If a YAML pipeline references an environment that does not exist, automatic creation depends on who initiated the operation and their permissions; pre-create environments for controlled client setups.
- Use exclusive locks and `lockBehavior` for environments where concurrent deployments are unsafe.

## 11) Artifacts

Pipeline artifacts:

- Publish via `publish` shortcut or `PublishPipelineArtifact@1`.
- Download via `download` shortcut or download task.
- Default download location is typically `$(Pipeline.Workspace)`.

Selection semantics:

- With artifact name: scoped matching within that artifact.
- Without artifact name: per-artifact subfolders are created.

Gotchas:

- Deployment jobs auto-download artifacts by default.
- Deleting a pipeline run removes artifacts tied to that run.
- Publish deployable artifacts once and deploy the same artifact to each environment. Avoid rebuilding separately for production unless the client explicitly requires it.

## 12) Failure-resilient design checklist

- Explicitly declare `trigger` and `pr`.
- Use `dependsOn` + clear `condition` with status guards.
- Pin task major versions.
- Use typed parameters for control-flow decisions.
- Keep secrets out of YAML; use variable groups/Key Vault/UI secrets.
- Authorize resources explicitly and avoid broad open access unless intentional.
- Prefer deployment jobs + environments for CD.
- Add timeouts/retries where external dependencies are flaky.
- Retry only idempotent operations or operations guarded against duplicate side effects.
- Model artifact publish/download paths explicitly.
- Document assumptions (repo type, default branch, approval owners, environment permissions).
- Verify the client can maintain every template indirection and protected-resource dependency introduced.
