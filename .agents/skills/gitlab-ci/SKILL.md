---
name: gitlab-ci
description: Design, debug, or review GitLab CI/CD pipelines and runner behavior.
metadata:
   source:
      - https://docs.gitlab.com/ci/
      - https://docs.gitlab.com/user/project/releases/
---

# GitLab CI/CD

Use the official GitLab docs as the source of truth. Treat blog posts, forum answers, and copied snippets as inspiration only.

## Default stance

Assume all of the following unless the user says otherwise:

- Self-managed GitLab.
- GitLab Free features only.
- Self-managed runners.
- Docker executor.
- Docker-in-Docker only when the pipeline truly needs Docker builds.
- Security matters more than shaving off a little YAML.

If the user wants a feature that is edition-sensitive, read [feature-availability.md](./references/feature-availability.md) before recommending it.

## Workflow

1. Identify the pipeline goal first:
   - CI only.
   - Release on tag.
   - CD to staging/production.
   - Monorepo orchestration.
   - Cross-project orchestration.
   - Container build/push.
2. Identify runner constraints:
   - Does the runner support `privileged = true`?
   - Is Docker socket binding allowed?
   - Are runners split by trust level with tags?
   - Are protected runners/branches/tags in use?
3. Decide whether to stay stage-based or use DAG with `needs`:
   - Keep simple pipelines stage-based.
   - Use `needs` only where faster feedback or parallel fan-out matters.
4. Design pipeline creation before job logic:
   - Prefer `workflow: rules` for which pipeline types should exist.
   - Prefer job-level `rules` over deprecated `only` / `except`.
   - Avoid branch + merge request duplicate pipelines.
5. Design data flow explicitly:
   - Use `artifacts` for build outputs or reports passed to later jobs.
   - Use `cache` only for reusable dependencies or tool caches.
   - If a job uses `needs`, remember it no longer downloads all previous artifacts automatically.
6. Design secrets and permissions conservatively:
   - Keep secrets in the UI, not in `.gitlab-ci.yml`.
   - Prefer protected + masked variables, and file-type variables for certs/keys.
   - Isolate privileged or deployment-capable runners with `tags`.
7. Prefer pinned versions for critical images:
   - `docker:24.0.5-cli` instead of `docker:latest`.
   - Match CLI and service versions for Docker jobs.
8. Validate special cases before finalizing:
   - `rules` evaluate before jobs run, so they cannot use dotenv values created by scripts.
   - `default:` does not merge with job config.
   - Arrays from includes usually replace, not append.
   - `when: manual` and `rules:when: manual` have different `allow_failure` defaults.

## Reference map

Read only what the task needs:

- [core.md](./references/core.md) for lifecycle, `rules`, `workflow`, `needs`, `include`, variables, cache, and artifacts.
- [docker-runners.md](./references/docker-runners.md) for Docker executor, DIND, socket binding, runner config, and security trade-offs.
- [patterns.md](./references/patterns.md) for ready-to-adapt pipeline patterns.
- [feature-availability.md](./references/feature-availability.md) for Free vs paid feature boundaries relevant to CI design.

## Opinionated defaults

### Pipeline control

- Use `workflow: rules` to decide whether a pipeline should exist.
- Use job `rules` to decide whether a job belongs in that pipeline.
- Prefer precise `if` conditions over a catch-all final `when: always` rule.

### Reuse

- Prefer `extends` and hidden template jobs for local reuse.
- Prefer `include:project` over `include:remote` for internal shared templates.
- Pin shared includes to a protected branch, tag, or full SHA.

### Docker builds

- If the job only runs tests or linters, do not add Docker services.
- If the job must build Docker images:
  - Use DIND only when the runner supports it and the trust boundary is acceptable.
  - Prefer TLS-enabled DIND when runner configuration is under your control.
  - Consider Buildah or rootless BuildKit when avoiding privileged mode matters more than compatibility.

### Releases and deployments

- Prefer the `release` keyword over hand-written API calls when creating GitLab releases.
- Prefer `registry.gitlab.com/gitlab-org/cli` / `glab` for release jobs.
- Put staging and production on separate runner pools when possible.
- Use `resource_group` for deployments that must never overlap.
- For production, prefer protected refs, protected variables, protected runners, and often a manual gate.

## Common pitfalls to catch

- Mixing `rules` jobs with legacy `only` / `except` jobs in the same pipeline.
- Using `needs` and `dependencies` together in one job.
- Using the same cache key for unrelated paths.
- Treating cache like a guaranteed transport mechanism.
- Forgetting that `needs` changes artifact download behavior.
- Using `docker:latest` or mismatched Docker CLI/DIND versions.
- Using privileged runners broadly instead of isolating them.
- Assuming external secrets or cross-project artifact fetches exist on GitLab Free.
- Passing masked secrets downstream as plain forwarded variables.
- Using `CI_COMMIT_REF_NAME` where `CI_COMMIT_REF_SLUG` is safer for environment names or URLs.

## Output expectations

When drafting or reviewing GitLab CI/CD config:

- Explain the pipeline type being built.
- Call out any runner assumptions explicitly.
- Call out any edition assumptions explicitly.
- Prefer small, composable examples over one giant kitchen-sink pipeline.
- Preserve existing naming and repository conventions unless the user asks for a redesign.
