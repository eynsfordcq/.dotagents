---
source:
  - https://docs.gitlab.com/ci/pipelines/
  - https://docs.gitlab.com/ci/yaml/
  - https://docs.gitlab.com/ci/jobs/job_rules/
  - https://docs.gitlab.com/ci/yaml/needs/
  - https://docs.gitlab.com/ci/caching/
  - https://docs.gitlab.com/ci/jobs/job_artifacts/
  - https://docs.gitlab.com/ci/yaml/includes/
  - https://docs.gitlab.com/ci/variables/
  - https://docs.gitlab.com/ci/variables/predefined_variables/
---

# Core GitLab CI/CD mechanics

## Pipeline lifecycle

- GitLab creates the pipeline first, then runners execute jobs.
- `rules` and `workflow: rules` are evaluated at pipeline creation time.
- Job-created values like dotenv outputs do not exist yet when `rules` are evaluated.
- Predefined variables have phases:
  - **Pre-pipeline**: usable in `include:rules` and pipeline creation decisions.
  - **Pipeline**: usable in job `rules`.
  - **Job-only**: usable in scripts, not in `rules`, `workflow`, or `include`.

## Stages vs DAG

- `stages` give simple ordered groups; jobs in the same stage run in parallel if runners are available.
- `needs` creates DAG behavior; a job starts as soon as its listed dependencies finish.
- Hybrid pipelines are normal: most jobs use stage order, a few use `needs`.
- `needs: []` starts a job immediately when the pipeline is created.
- Do not use `needs` and `dependencies` together in the same job.

## `workflow: rules`

Use it to decide whether a pipeline should exist at all.

Good uses:

- Avoid duplicate branch + merge request pipelines.
- Skip pipelines for drafts or special commit titles.
- Separate push, MR, schedule, tag, and trigger behavior.

Important details:

- First matching rule wins.
- If no workflow rule matches, the pipeline is not created.
- Only `when: always` and `when: never` are valid in `workflow: rules`.

## Job `rules`

- Prefer `rules` over deprecated `only` / `except`.
- First matching rule wins.
- If no rule matches, the job is not added.
- `rules` can combine `if`, `changes`, and `exists` in one rule; all must match.
- `rules:when: manual` defaults to `allow_failure: false`.
- Top-level `when: manual` defaults to `allow_failure: true`.

### Frequent `if` clauses

- `$CI_PIPELINE_SOURCE == "merge_request_event"`
- `$CI_PIPELINE_SOURCE == "push"`
- `$CI_PIPELINE_SOURCE == "schedule"`
- `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH`
- `$CI_COMMIT_TAG`
- `$CI_COMMIT_BRANCH`

### Duplicate pipeline warning

Avoid broad final rules like this unless `workflow: rules` already constrains pipeline creation:

```yaml
rules:
  - when: always
```

That pattern often causes both push and merge request pipelines for the same commit.

## Includes and reuse

- `include` is resolved before the main file is merged.
- Included configuration is a snapshot taken when the pipeline starts.
- Hashes deep-merge; arrays generally replace instead of append.
- Prefer `include:project` for internal shared templates.
- If using `include:remote`, treat it like a third-party dependency and use integrity checks when possible.
- Self-managed instances default to a maximum of 150 includes per pipeline.

## Variables

- YAML variables are for non-sensitive configuration only.
- Sensitive values belong in GitLab UI variables or external secret providers.
- Quoting matters. `012345` without quotes can be parsed unexpectedly.
- Do not override predefined variables unless absolutely necessary.

### Security

- Use **Protected** variables for protected branches/tags.
- Use **Masked** variables to reduce accidental log exposure, but do not treat masking as strong security.
- Prefer **File** variables for certificates, kubeconfigs, JSON keys, and similar file-shaped secrets.

### Precedence highlights

From higher to lower among common cases:

1. Pipeline variables / trigger variables / scheduled variables / manual-run variables.
2. Project variables.
3. Group variables.
4. Instance variables.
5. Dotenv report variables.
6. Job-level YAML variables.
7. Top-level YAML variables.
8. Predefined variables.

## Cache vs artifacts

### Cache

Use for dependency reuse across jobs or later pipelines.

- Runner-side optimization, not a guaranteed transport.
- Restored before artifacts.
- Same cache key + different paths can overwrite each other.
- Use stable keys based on lockfiles, branch, or fallback keys.
- Multiple standalone runners without shared/distributed cache often lead to misses.

### Artifacts

Use for build outputs, reports, or files needed by later jobs.

- Stored by GitLab.
- Later-stage jobs fetch previous-stage artifacts by default.
- Jobs using `needs` only fetch artifacts from listed needed jobs.
- Use `expire_in` deliberately; too-short retention breaks long pipelines.

## `default:` behavior

`default:` is useful for common `image`, `before_script`, `cache`, `tags`, `retry`, and similar settings.

Important caveat:

- Default and job config do **not** merge for keywords like `image`, `services`, `cache`, `before_script`, or `artifacts`.
- If a job defines the keyword, that job value replaces the default for that keyword.
