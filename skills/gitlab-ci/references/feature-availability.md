---
source:
  - https://docs.gitlab.com/ci/secrets/
  - https://docs.gitlab.com/ci/yaml/
  - https://docs.gitlab.com/ci/pipelines/downstream_pipelines/
  - https://docs.gitlab.com/ci/variables/
  - https://docs.gitlab.com/ci/environments/
  - https://docs.gitlab.com/user/project/releases/
---

# Feature availability notes for practical pipeline design

Use this file when the user mentions GitLab Free, self-managed feature limits, or asks for a feature that may require a paid tier.

## Safe assumptions for GitLab Free

These patterns are available on GitLab Free and are safe defaults to recommend:

- standard pipelines, stages, jobs, `rules`, `workflow: rules`
- DAG execution with `needs` inside the same pipeline
- `include`, `extends`, YAML reuse
- artifacts and cache
- environments and review apps
- releases via the `release` keyword
- trigger API pipelines
- parent-child pipelines
- multi-project pipelines
- Docker executor and Docker builds on self-managed runners

## Common paid-tier traps

### External secrets

`secrets:` integrations for Vault / cloud secret managers are documented as Premium / Ultimate.

For Free-tier guidance, prefer:

- protected variables
- masked variables
- file-type variables
- careful runner isolation

### `needs:project`

Cross-project artifact download with `needs:project` is Premium / Ultimate.

On GitLab Free, avoid designs that depend on fetching artifacts directly from another project's pipeline with `needs:project`.

### Group variable environment scopes

Group-level environment scope is documented as Premium / Ultimate.

Project-level environment scope is still useful on Free, so prefer project-scoped deployment variables when the user is on Free.

## Features that are easy to overstate

### Masking

Masked variables reduce accidental exposure in logs, but are not a strong security boundary.

Do not claim:

- masked variables are fully safe against malicious pipeline code
- reviewers can safely run untrusted `.gitlab-ci.yml` changes because values are masked

### Docker socket binding

It avoids `docker:dind`, but does **not** make the runner low-risk. It still gives the job strong control over the host Docker daemon.

### Multi-project pipelines vs cross-project artifacts

Multi-project pipelines are available broadly, but some related conveniences are not.

Be explicit about which of these you mean:

- triggering another project's pipeline: generally fine
- downloading artifacts from another project's latest successful pipeline with `needs:project`: paid tier

## Version-sensitive recommendations

When the task touches newer GitLab behavior, check current docs first.

Important examples:

- `strategy: mirror` is preferred over `strategy: depend`
- pipeline inputs are recommended over pipeline variables on newer GitLab versions
- release jobs should use recent `glab`; `release-cli` is being phased out

## Response pattern for edition-sensitive advice

When a requested feature may require more than Free, say so plainly and then give the best Free-tier alternative.

Example structure:

1. Name the feature.
2. State that docs mark it Premium / Ultimate if applicable.
3. Offer a Free-tier pattern that preserves the main goal.
