# Immutable container releases — BUILD ONCE, PROMOTE MANY

Guarantees that DEV, REC and PROD run exactly the same artifacts:
schoolflow-api and schoolflow-frontend images are built exactly once per
release, identified by their real OCI digest, and every environment
promotes that same digest — never a rebuild, never a mutable `:latest` tag.

## Why

Before this change, `.github/workflows/build-push-acr.yml` built
`schoolflow-api`/`schoolflow-frontend` and pushed them to a single mutable
tag, `:latest`, on every push to `main`. `.github/workflows/deploy-azure.yml`
then deployed whatever `:latest` happened to point at when each environment
was promoted — DEV, REC and PROD could each pull a *different* image for
the exact same "deploy latest" action, depending on exactly when the pull
happened relative to the next push. There was no way to prove DEV, REC and
PROD were ever running the same code, and no way to roll back to a known
image without rebuilding it (a rebuild is not guaranteed to reproduce the
same bytes — dependency resolution, base image updates, and build cache
state can all drift between two builds of the "same" commit).

## Architecture

```
Git commit (push to main, or workflow_dispatch)
        |
        v
  BUILD ONCE  (.github/workflows/build-images.yml)
        |
        +-- backend/** changed?  -> docker build+push  backend:<full 40-char SHA>
        |                            (api + worker + migration job — one image)
        +-- frontend paths changed? -> docker build+push frontend:<full 40-char SHA>
        |
        v
  Azure Container Registry returns the real OCI digest for each push
        |
        v
  RELEASE MANIFEST  (release-manifest.json)
        {
          "release": { "git_sha": "<40-char sha>", ... },
          "backend":  { "repository": "...schoolflow-api",  "tag": "<sha>", "digest": "sha256:AAA" },
          "frontend": { "repository": "...schoolflow-frontend", "tag": "<sha>", "digest": "sha256:BBB" },
          "components": { "api": "backend", "worker": "backend", "migration": "backend", "frontend": "frontend" }
        }
        |
        v
  Published as a GitHub Release, tag "release-<sha>"
        |
        +-----------------------+-----------------------+
        |                       |                       |
     PROMOTE DEV             PROMOTE REC             PROMOTE PROD
  (.github/workflows/deploy-azure.yml — no docker build anywhere)
        |                       |                       |
        v                       v                       v
   SAME digest AAA          SAME digest AAA          SAME digest AAA
   SAME digest BBB          SAME digest BBB          SAME digest BBB
```

`api`, `worker` and the one-shot migration Job introduced in #263
(`docs/AZURE_ONE_SHOT_MIGRATIONS.md`) all run **the same backend image** —
`infra/azure/modules/container-apps.bicep` passes one `backendImage`
parameter (a full `registry/repository@sha256:digest` reference) to all
three. There has never been a reason to build three separate images for
identical code with three different commands, so this repo never has.

## Build (`build-images.yml`)

- Triggered by `push` to `main` with path filters (see "Triggers" below),
  or manually via `workflow_dispatch` (with `force_backend`/
  `force_frontend` inputs to build a side that didn't change — e.g. to
  pick up a base-image security patch).
- Tags every image with the **full 40-character Git SHA** — never a short
  SHA as the primary identity, never `:latest`.
- Captures the real digest `docker/build-push-action` returns after the
  push (`steps.build.outputs.digest`), not just the tag — a tag is a
  mutable pointer even when it looks like a SHA; the digest is the actual
  content hash.
- Adds OCI labels (`org.opencontainers.image.revision` = the full Git SHA,
  `.source` = the repo URL, `.created` = build timestamp) to each image, so
  `docker inspect`/`skopeo inspect` on a running container can always be
  traced back to the exact commit — no secrets in any of them.
- Scans the pushed image (by digest) with Trivy for HIGH/CRITICAL
  vulnerabilities, uploading SARIF results to GitHub code scanning.
  Non-blocking in this pass — see "Security" below for why.
- Generates an SPDX SBOM for the pushed image (by digest) via
  `anchore/sbom-action`, uploaded as a workflow artifact and attached to
  the release.
- Publishes a GitHub Release tagged `release-<sha>` with
  `release-manifest.json` (and any SBOMs produced this run) as assets.

### Coherent releases when only one side changes

If only frontend paths changed, `build-backend` does not run — there is no
reason to rebuild identical backend code. Instead, `resolve-backend` looks
up the most recently pushed **full-Git-SHA-tagged** backend image already
in ACR (via `az acr repository show-tags`/`show`, filtered to 40-hex-char
tags only — never a `:latest`-style guess) and uses its real, previously
built and scanned digest in the manifest. Symmetric for a backend-only
change (`resolve-frontend`). This is what makes a frontend-only release
still name a *validated, already-scanned* backend digest instead of either
inventing a needless backend rebuild or leaving the manifest incomplete.

If neither a build nor a resolvable prior image exists for a side (e.g.
the very first run, before any image has ever been pushed), the workflow
**fails** rather than publishing an incomplete or fabricated manifest.

## Release manifest

```json
{
  "release": {
    "git_sha": "a1b2c3d4e5f6...40 hex chars",
    "created_at": "2026-09-29T12:00:00Z",
    "workflow_run_id": "123456789"
  },
  "backend": {
    "repository": "academyguineenneacr.azurecr.io/schoolflow-api",
    "tag": "a1b2c3d4e5f6...",
    "digest": "sha256:aaaaaaaa...64 hex chars"
  },
  "frontend": {
    "repository": "academyguineenneacr.azurecr.io/schoolflow-frontend",
    "tag": "a1b2c3d4e5f6...",
    "digest": "sha256:bbbbbbbb...64 hex chars"
  },
  "frontend_appservice": {
    "repository": "academyguineenneacr.azurecr.io/schoolflow-frontend-appservice",
    "tag": "a1b2c3d4e5f6...",
    "digest": "sha256:cccccccc...64 hex chars"
  },
  "components": {
    "api": "backend",
    "worker": "backend",
    "migration": "backend",
    "frontend": "frontend",
    "appservice_frontend": "frontend_appservice"
  }
}
```

`frontend_appservice` (2026-10) is the frontend image for **Azure App
Service** (`Dockerfile.appservice`: static files only, no nginx proxy to the
docker-compose hostname `api`, listens on `0.0.0.0:${PORT}`). It is pushed,
pulled back **by digest** and smoke-tested (`scripts/ci/smoke-frontend-appservice.sh`)
before its digest is published; `deploy-appservice.yml` deploys this image —
never `frontend`, which only runs where an `api` host exists (docker-compose,
Container Apps).

`backend.tag`/`frontend.tag` can legitimately differ from `release.git_sha`
when a side was resolved from a prior build rather than rebuilt this run —
that is by design (see "Coherent releases" above), not a bug: it is exactly
how a frontend-only change still ships a fully-specified, coherent release.
`components` makes the shared-image relationship explicit for any tooling
or human reading the manifest without needing to already know the Bicep
wiring. **No secret of any kind appears in this document** — repository
names, tags (Git SHAs) and digests only.

## Promotion (`deploy-azure.yml`)

Unchanged trigger model (`workflow_dispatch`-only, gated by a GitHub
Environment requiring human approval per `dev`/`rec`/`prod` — see
`infra/azure/README.md`). What changed is the input: instead of a raw
`image_tag` (which defaulted to `"latest"`), it now takes `release_tag` —
the tag of a GitHub Release published by `build-images.yml`
(`release-<sha>`), **required, no default**.

The first step (`Resolve release manifest`) downloads that release's
`release-manifest.json` via `gh release download` and validates it before
anything else runs:

- Release doesn't exist → fail.
- Release exists but has no manifest asset → fail.
- A digest doesn't match `^sha256:[0-9a-f]{64}$` → fail.

Only once both digests are confirmed present and well-formed does the
workflow proceed to `az deployment group what-if` then
`az deployment group create`, passing `backendImage`/`frontendImage` as
full `registry/repository@sha256:digest` references — **never** a tag,
**never** a fallback to `:latest`. There is no `docker build` or
`docker push` anywhere in this workflow: promoting REC or PROD is reading
the same manifest DEV already read and pointing Bicep at the same two
digests.

### DEV → REC → PROD, no rebuild

Because promotion only ever reads `release-manifest.json` and pins Bicep
parameters to the digests it names, running the promote workflow three
times with the same `release_tag` (`dev`, then `rec`, then `prod`) deploys
the *same two OCI digests* to all three — provably, since the manifest
itself is the single source of truth and nothing between DEV and PROD can
introduce a different image. This is HOW TO PROVE DEV == REC == PROD:

```bash
gh release download release-<sha> --pattern release-manifest.json --output -
# Compare .backend.digest / .frontend.digest against what's actually
# running in each environment:
az containerapp show --name ca-schoolflow-api-dev  --resource-group rg-schoolflow-dev  --query "properties.template.containers[0].image"
az containerapp show --name ca-schoolflow-api-rec  --resource-group rg-schoolflow-rec  --query "properties.template.containers[0].image"
az containerapp show --name ca-schoolflow-api-prod --resource-group rg-schoolflow-prod --query "properties.template.containers[0].image"
```
All three `image` values (and the equivalent `ca-schoolflow-frontend-*`/
`caj-schoolflow-migrate-*` ones) must show the identical
`...@sha256:...` string when all three environments have promoted the
same release.

## Migration job (#263) uses the release's backend digest

`infra/azure/modules/container-apps.bicep`'s `migrationJob`,
`apiApp` and `workerApp` all receive the same `backendImage` parameter
from `main.bicep` — there is exactly one place in the whole stack that
names a backend image, so migration code, API code and worker code are
structurally guaranteed to come from the same artifact for any given
deploy. This does not regress `docs/AZURE_ONE_SHOT_MIGRATIONS.md`'s
migrate-before-deploy ordering (`deployApps=false` → run+wait on the
migration Job → `deployApps=true`) — only the *value* passed for the image
changed, from a mutable tag to a digest.

## Rollback

Rollback is "promote an older release" — `deploy-azure.yml` with
`release_tag` set to a previous `release-<sha>`. This deploys the exact
same digests that release previously deployed, with **no rebuild**.

As with #263, an application rollback **never** automatically runs
`alembic downgrade` — see `docs/AZURE_ONE_SHOT_MIGRATIONS.md#rollback` for
the full policy (unchanged by this document). If the schema migrated by
the newer release is not backward-compatible with the older application
version, rolling back the application without first handling the schema is
unsafe regardless of image immutability — immutable images make *what
code is running* provable, they do not by themselves make an arbitrary
rollback safe against an incompatible schema change.

## Verification / troubleshooting

**"Which commit is this container actually running?"**
```bash
az containerapp show --name ca-schoolflow-api-dev --resource-group rg-schoolflow-dev \
  --query "properties.template.containers[0].image" -o tsv
# -> academyguineenneacr.azurecr.io/schoolflow-api@sha256:<digest>
az acr repository show --name academyguineenneacr --image schoolflow-api@sha256:<digest> \
  --query "tags" -o tsv
# -> the full Git SHA it was built from
```
Or read the image's own OCI labels directly:
```bash
docker buildx imagetools inspect academyguineenneacr.azurecr.io/schoolflow-api@sha256:<digest> \
  --format '{{json .Image.Config.Labels}}'
```

**"A promotion failed at 'Resolve release manifest'"** — the release tag
was mistyped, the release was deleted, or (very unlikely, since
`build-images.yml` always uploads it before publishing) the manifest asset
is missing. Re-check the release on the repository's Releases page; if it
genuinely doesn't exist, run `build-images.yml` (via `workflow_dispatch`
with the appropriate `force_*` input if no source changed) to produce one.

**"I need a backend image but backend/** hasn't changed in a while"** —
run `build-images.yml` via `workflow_dispatch` with `force_backend: true`.
This is the correct way to pick up an unrelated base-image (`python:3.11-
slim`) security patch without touching application code.

## Security

- **Vulnerability scanning**: Trivy scans every pushed image (by digest,
  the exact bytes that will be promoted) for HIGH/CRITICAL findings,
  uploaded to GitHub code scanning as SARIF. **Non-blocking by deliberate
  choice in this PR** (`exit-code: "0"`): a HIGH/CRITICAL finding in a
  pre-existing, unrelated base-image package (`python:3.11-slim`,
  `node:22-slim`) would otherwise fail every future build of unrelated
  application code, for a risk this pipeline has no way to fix by itself.
  Findings are surfaced, not hidden — tightening this to `exit-code: "1"`
  once the team has a process for triaging/accepting base-image CVEs is a
  reasonable follow-up, not done here to avoid blocking this PR's actual
  scope on an unrelated policy decision.
- **SBOM**: an SPDX SBOM is generated per image, per release, from the
  pushed digest (not a separate local rebuild), uploaded as a workflow
  artifact and attached to the GitHub Release — associated with the exact
  Git SHA and digest that produced it.
- **Secrets**: `release-manifest.json`, the GitHub Release notes, and every
  workflow log line this pipeline prints contain only registry hostnames,
  repository names, Git SHAs and OCI digests — never a connection string,
  password, or credential. Since 2026-10-08 the pipeline holds **no
  registry password**: each job signs in with `azure/login` (OIDC) as the
  dedicated build identity `github-gestion-scolaire-pro-acr-build`
  (`secrets.AZURE_BUILD_CLIENT_ID`, federated credential limited to
  `refs/heads/main`, roles AcrPush + Reader on the registry only — separate
  from the deploy identity), then `az acr login` writes a short-lived token
  used by buildx, Trivy and the SBOM step. The former admin-user secrets
  `ACR_USERNAME`/`ACR_PASSWORD` are no longer referenced (removal of the
  secrets and of the registry admin user: step C of the ACR plan, once App
  Service pulls by managed identity).
- **No `:latest` anywhere applicative**: neither `build-images.yml` nor
  `deploy-azure.yml` nor `infra/azure/**` names `:latest` for
  `schoolflow-api`/`schoolflow-frontend`. (The frontend Dockerfile's Nginx
  base image remains pinned by digest, as it already was; that is an
  external base image, not an application artifact, and pinning it was
  already correct before this change.)

## Local development

Unaffected. `docker-compose.yml` builds `backend/Dockerfile` and the root
`Dockerfile` locally from source (`build:` context, not `image:` from a
registry) — this document only governs what gets pushed to ACR and
deployed to Azure, never the local dev loop.

## Known limitations / remaining risks

- No real Azure deployment has validated this pipeline end-to-end — only
  `bicep build`/`bicep lint` locally and YAML/logic review of the modified
  workflows. `az acr repository show-tags`/`show` with `--username`/
  `--password` flags (used by `resolve-backend`/`resolve-frontend`) is
  standard, documented Azure CLI behavior for ACR's data-plane API, but has
  not been exercised against the real `academyguineenneacr` registry as
  part of this change.
- Trivy scanning is intentionally non-blocking (see "Security" above) —
  a real HIGH/CRITICAL finding will not by itself stop a promotion.
- `gh release create`/`gh release download` depend on the repository's
  default `GITHUB_TOKEN` having release read/write access, which it does
  by default for a repo-owned workflow; an organization that has
  restricted the default token's permissions beyond this repo's own
  `permissions:` blocks would need to revisit this.
- Rollback restores the same digests but never reverses a schema migration
  — see the Rollback section above and `docs/AZURE_ONE_SHOT_MIGRATIONS.md`.
