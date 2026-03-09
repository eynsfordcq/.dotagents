---
source:
  - https://docs.gitlab.com/runner/executors/docker/
  - https://docs.gitlab.com/ci/docker/using_docker_build/
  - https://docs.gitlab.com/ci/yaml/
---

# Docker executor and Docker builds

## Docker executor basics

The Docker executor runs each job in its own container and splits execution into:

1. Prepare services.
2. Pre-job clone/cache/artifact restore.
3. Job container execution.
4. Post-job cache/artifact upload.

Key runner facts:

- The runner needs a default image in `config.toml` when registered.
- A job-level `image` overrides the runner default image.
- The job image must provide a working shell in `PATH`.

## Runner settings to think about

Common `config.toml` settings that affect pipeline design:

- `privileged`
- `volumes`
- `pull_policy` and `allowed_pull_policies`
- `allowed_images` and `allowed_services`
- `services_privileged` and `allowed_privileged_services`
- `concurrent`
- runner `tags`

Prefer narrow, dedicated runner pools:

- unprivileged lint/test runners
- privileged image-build runners
- deployment runners with environment access

## Docker-in-Docker (DIND)

Use DIND only when the job actually needs to run Docker commands against a daemon.

### Good defaults

- Pin both images to the same version.
- Prefer `docker:<version>-cli` for the job image.
- Prefer `docker:<version>-dind` for the service.
- Keep privileged runners isolated and tagged.

### TLS-enabled DIND

Prefer this when you control runner config.

Runner usually needs a shared cert volume, for example:

```toml
[runners.docker]
  privileged = true
  volumes = ["/certs/client", "/cache"]
```

Job shape:

```yaml
default:
  image: docker:24.0.5-cli
  services:
    - docker:24.0.5-dind

variables:
  DOCKER_TLS_CERTDIR: "/certs"
```

### TLS-disabled DIND

Use only when you cannot support TLS wiring on the runner.

```yaml
image: docker:24.0.5-cli
services:
  - docker:24.0.5-dind
variables:
  DOCKER_HOST: tcp://docker:2375
  DOCKER_TLS_CERTDIR: ""
```

This is common, but less secure than the TLS-enabled pattern.

### Socket-over-shared-volume DIND

If multiple jobs share a persistent cert path, use a dedicated temporary socket volume instead of a shared cert directory. This reduces conflicts and can be faster.

## Security reality of DIND

DIND with Docker executor requires `privileged = true` for standard Docker images.

That means:

- container security boundaries are weakened
- host breakout risk increases
- it should not be available on broad shared runner pools

If a pipeline builds images for trusted repos only, isolate those jobs with tags and protected runners.

## Docker socket binding

Socket binding means the job talks to the host Docker daemon directly.

Advantages:

- no DIND service
- no privileged container requirement for the job itself
- simple setup

Trade-offs:

- still high-risk; the job effectively controls the host daemon
- sibling-container behavior can surprise builds/tests
- concurrent jobs can conflict
- host path semantics apply to volume mounts
- do **not** combine it with `docker:dind`

Use on trusted private runners only.

## Alternatives when avoiding privileged mode matters

Prefer these when security is tighter than Docker compatibility:

- Buildah
- rootless BuildKit
- Podman

GitLab docs explicitly recommend daemonless alternatives for building container images without privileged mode.

## Performance and reliability tips

- Pin versions; avoid `docker:latest`.
- Consider `DOCKER_DRIVER: overlay2` when supported.
- Use registry mirrors if Docker Hub rate limits or latency hurt builds.
- Be deliberate about pull policy; `always` is safest on shared runners.
- Restrict allowed images/services on sensitive runners.

## Rootless restricted privileged services

If you want a safer DIND posture and your runner supports it, GitLab Runner can allow only specific rootless DIND service images to run privileged by using:

- `services_privileged = true`
- `allowed_privileged_services = [...]`

That is safer than making every job and service fully privileged, but it still belongs on trusted infrastructure.
