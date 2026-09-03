---
source:
  - https://docs.gitlab.com/ci/yaml/
  - https://docs.gitlab.com/ci/jobs/job_rules/
  - https://docs.gitlab.com/ci/environments/
  - https://docs.gitlab.com/ci/pipelines/downstream_pipelines/
  - https://docs.gitlab.com/user/project/releases/
  - https://docs.gitlab.com/ci/triggers/
  - https://docs.gitlab.com/ci/docker/using_docker_build/
---

# Practical pipeline patterns

## 1. CI only

Use for lint, test, and build without deployment.

Design notes:

- Keep it stage-based unless runtime is clearly painful.
- Cache dependencies, artifact the build output.
- Publish JUnit or other reports for visibility.
- Run on branches and merge requests.

Starter shape:

```yaml
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH

stages: [lint, test, build]

lint:
  stage: lint
  script:
    - make lint

test:
  stage: test
  script:
    - make test
  artifacts:
    when: always
    reports:
      junit: junit.xml

build:
  stage: build
  script:
    - make build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
```

## 2. Release on tag

Use when a pushed tag should build artifacts, optionally build/push a container, and create a GitLab release.

Design notes:

- Prefer a `release` job over hand-written API calls.
- Use `registry.gitlab.com/gitlab-org/cli` or another image with recent `glab`.
- Protect release tags if releases should be tightly controlled.
- Remember: the release job fails if the release already exists.

Starter shape:

```yaml
stages: [test, build, release]

build:
  stage: build
  script:
    - make build
  artifacts:
    paths: [dist/]

release:
  stage: release
  image: registry.gitlab.com/gitlab-org/cli:v1.58.0
  rules:
    - if: $CI_COMMIT_TAG
  script:
    - echo "creating release"
  release:
    tag_name: $CI_COMMIT_TAG
    name: Release $CI_COMMIT_TAG
    description: ./CHANGELOG.md
```

If the pipeline also builds a container image, add a dedicated Docker build job before `release`.

## 3. CD: default branch to staging, tag to production

Use when `main` or the default branch deploys automatically to staging, while tags deploy to production.

Design notes:

- Separate staging and production runners with tags.
- Use protected refs and protected variables for production.
- Add `resource_group` for production to prevent overlapping deploys.
- Consider `when: manual` for production even when tag-driven.

Starter shape:

```yaml
stages: [build, deploy]

build:
  stage: build
  script:
    - make build
  artifacts:
    paths: [dist/]

deploy_staging:
  stage: deploy
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  environment:
    name: staging
    url: https://staging.example.com
  tags: [staging]
  script:
    - ./deploy.sh staging

deploy_prod:
  stage: deploy
  rules:
    - if: $CI_COMMIT_TAG
      when: manual
  environment:
    name: production
    url: https://example.com
  resource_group: production
  tags: [production]
  script:
    - ./deploy.sh production
```

## 4. Dynamic review apps

Use when each branch or merge request gets its own environment.

Design notes:

- Use `CI_COMMIT_REF_SLUG`, not `CI_COMMIT_REF_NAME`, for environment names.
- Keep deploy and stop jobs aligned with the same `rules`.
- Put stop job in the same stage, or add `needs`, so it remains runnable.
- Use `auto_stop_in` for cleanup.

Starter shape:

```yaml
deploy_review:
  stage: deploy
  rules:
    - if: $CI_MERGE_REQUEST_ID
  script:
    - ./deploy-review.sh
  environment:
    name: review/$CI_COMMIT_REF_SLUG
    url: https://$CI_ENVIRONMENT_SLUG.example.com
    on_stop: stop_review
    auto_stop_in: 1 week

stop_review:
  stage: deploy
  rules:
    - if: $CI_MERGE_REQUEST_ID
      when: manual
      allow_failure: true
  script:
    - ./destroy-review.sh
  environment:
    name: review/$CI_COMMIT_REF_SLUG
    action: stop
```

## 5. Parent-child pipelines

Use for monorepos or generated sub-pipelines in the same project.

Design notes:

- Child jobs see `CI_PIPELINE_SOURCE == "parent_pipeline"`.
- For MR-aware child jobs, use `CI_MERGE_REQUEST_ID`, not `merge_request_event`.
- Use `strategy: mirror` when upstream status must track downstream completion.
- Dynamic child pipelines are powerful for change-based fan-out.

## 6. Multi-project pipelines

Use when deployment logic or shared orchestration lives in another repository.

Design notes:

- Triggered pipeline jobs see `CI_PIPELINE_SOURCE == "pipeline"`.
- Upstream user/job must be allowed to start downstream pipelines.
- Prefer `strategy: mirror` over `depend`.
- Prefer inputs over loosely typed forwarded variables.
- Do not forward masked secrets blindly into another project.

Starter trigger shape:

```yaml
deploy:
  stage: deploy
  trigger:
    project: my-group/deployment-project
    branch: main
    strategy: mirror
  variables:
    UPSTREAM_ENVIRONMENT: production
  environment: production
```

## 7. Trigger API pipelines

Use when external systems or another project need to start a pipeline through the API.

Design notes:

- Store trigger tokens as masked variables.
- Use `POST`, not `GET`.
- Check that `workflow: rules` does not block `CI_PIPELINE_SOURCE == "trigger"`.
- Prefer pipeline inputs over arbitrary trigger variables on newer GitLab versions.
