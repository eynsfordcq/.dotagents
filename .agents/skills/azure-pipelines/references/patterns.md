# Azure Pipelines YAML Patterns

These examples are YAML-first pipeline architecture patterns. Adapt names, pools, tasks, service connections, and governance to the client; do not treat these as our default infrastructure.

## 1) CI only

Use when the pipeline only validates changes and produces no deployable release. Keep language-specific build/test details inside the client's existing scripts or templates.

```yaml
name: ci-$(Date:yyyyMMdd)-$(Rev:.r)

trigger:
  branches:
    include:
      - main
      - feature/*
  paths:
    exclude:
      - docs/**

# Keep PR trigger only where repository type supports it.
# For Azure Repos Git, prefer branch policies for PR validation.
pr:
  autoCancel: true
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

variables:
  - name: TEST_RESULTS
    value: test-results/*.xml

stages:
  - stage: Validate
    jobs:
      - job: Test
        timeoutInMinutes: 30
        steps:
          - checkout: self

          - script: ./scripts/ci-test.sh
            displayName: Run project validation

          - task: PublishTestResults@2
            condition: succeededOrFailed()
            inputs:
              testResultsFormat: JUnit
              testResultsFiles: $(TEST_RESULTS)
```

## 2) Release on tag (build, test, release compiled Go binary)

Use when release should happen from tag refs. This pattern produces a single artifact for downstream release use; adapt the build command to the client project.

```yaml
name: rel-$(Date:yyyyMMdd)-$(Rev:.r)

trigger:
  branches:
    include:
      - main
  tags:
    include:
      - v*

pr: none

pool:
  vmImage: ubuntu-latest

variables:
  - name: GO_VERSION
    value: '1.23.x'
  - name: ARTIFACT_NAME
    value: release-binaries

stages:
  - stage: Test
    jobs:
      - job: GoTest
        steps:
          - checkout: self
          - task: GoTool@0
            inputs:
              version: $(GO_VERSION)
          - script: ./scripts/ci-test.sh
            displayName: Run project validation

  - stage: BuildReleaseBinary
    dependsOn: Test
    condition: and(succeeded(), startsWith(variables['Build.SourceBranch'], 'refs/tags/v'))
    jobs:
      - job: Build
        steps:
          - checkout: self
          - task: GoTool@0
            inputs:
              version: $(GO_VERSION)

          - script: |
              set -euo pipefail
              mkdir -p out
              CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o out/myapp-linux-amd64 ./cmd/myapp
              CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o out/myapp-darwin-arm64 ./cmd/myapp
              CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o out/myapp-windows-amd64.exe ./cmd/myapp
            displayName: Compile release binaries

          - publish: out
            artifact: $(ARTIFACT_NAME)
            displayName: Publish binaries
```

Optional release job pattern:

- Add a following stage that downloads `$(ARTIFACT_NAME)` and creates release notes/assets using your preferred toolchain.

## 3) CD to staging and prod (deployment jobs + environments)

This pattern shows build once, deploy the same artifact to staging and production, and rely on environment checks for governance.

```yaml
name: cd-$(Date:yyyyMMdd)-$(Rev:.r)

trigger:
  branches:
    include:
      - main

pr: none

pool:
  vmImage: ubuntu-latest

variables:
  - name: APP_ARTIFACT
    value: app-drop

stages:
  - stage: Build
    jobs:
      - job: BuildAndPackage
        steps:
          - checkout: self
          - script: |
              set -euo pipefail
              mkdir -p dist
              echo "build-output" > dist/app.txt
            displayName: Build app

          - publish: dist
            artifact: $(APP_ARTIFACT)
            displayName: Publish deployable artifact

  - stage: Deploy_Staging
    dependsOn: Build
    jobs:
      - deployment: DeployStaging
        displayName: Deploy to Staging
        environment: staging
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: $(APP_ARTIFACT)
                - script: |
                    set -euo pipefail
                    echo "Deploying to staging from $(Pipeline.Workspace)/$(APP_ARTIFACT)"
                  displayName: Deploy staging

  - stage: Deploy_Prod
    dependsOn: Deploy_Staging
    condition: succeeded()
    # Prefer approvals/checks on the 'production' environment resource.
    jobs:
      - deployment: DeployProd
        displayName: Deploy to Production
        environment: production
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: $(APP_ARTIFACT)
                - script: |
                    set -euo pipefail
                    echo "Deploying to production from $(Pipeline.Workspace)/$(APP_ARTIFACT)"
                  displayName: Deploy production
```

Recommended governance for this CD pattern:

- Configure manual approvals/checks on the `production` environment resource.
- If concurrent deploys are risky, use resource exclusive lock and set `lockBehavior` (`sequential` or `runLatest`) at stage or pipeline level.
- Confirm who administers the `staging` and `production` environments before broadening pipeline permissions.

## 4) Pipeline completion trigger (optional split CI/CD)

Use when CI and CD are split into separate pipelines. Check for duplicate runs if the CD pipeline also has CI triggers.

```yaml
resources:
  pipelines:
    - pipeline: appci
      source: app-ci
      trigger:
        branches:
          include:
            - main

trigger: none
pr: none

stages:
  - stage: Deploy
    jobs:
      - job: ShowSource
        steps:
          - script: echo "Triggered by $(resources.pipeline.appci.runName)"
```

## 5) Schedule-only pipeline (nightly)

Use when this pipeline should run only by cron schedule.

```yaml
trigger: none
pr: none

schedules:
  - cron: '0 0 * * *'
    displayName: Daily midnight build
    branches:
      include:
        - main
    always: false
    batch: true
```

Notes:

- Cron is UTC.
- UI-defined schedules can override YAML schedules.
- Use `Build.CronSchedule.DisplayName` in conditions when multiple schedules exist.

## 6) Extends template entrypoint

Use when the client wants a governed pipeline contract. Combine this with required-template checks on protected resources when appropriate.

```yaml
trigger:
  branches:
    include:
      - main

pr:
  branches:
    include:
      - main

resources:
  repositories:
    - repository: pipelineTemplates
      type: git
      name: Platform/pipeline-templates
      ref: refs/tags/v1.4.0

extends:
  template: templates/service-ci-cd.yml@pipelineTemplates
  parameters:
    serviceName: payments-api
    buildSteps:
      - script: ./scripts/build.sh
        displayName: Build
    testSteps:
      - script: ./scripts/ci-test.sh
        displayName: Test
    environments:
      - staging
      - production
```

Notes:

- Pin shared templates according to the client's release-control process.
- Keep template parameters typed and constrained where possible.
- Do not pass secrets as parameters.
