# Docker Deployment Guide

## Overview

The application uses a multi-stage Docker build optimized for production:

| Stage | Base | Purpose |
|-------|------|---------|
| **deps** | `node:20-alpine` | Installs npm dependencies + native build tools (cairo, pango, etc. for `canvas` module) |
| **builder** | `node:20-alpine` | Copies deps, inlines `NEXT_PUBLIC_*` env vars, runs `npm run build` |
| **runner** | `node:20-alpine` | Minimal production image with standalone output, runtime native libs, non-root user |

Next.js is configured with `output: 'standalone'` in `next.config.ts`, which produces a self-contained `server.js` that includes only the files needed to run in production. The final image runs `node server.js` on port 3000.

## Prerequisites

- **Node.js 20** (used inside the container; not needed on the host unless building locally)
- **Docker** (for local builds)
- **GitHub Container Registry (GHCR) access** (for CI/CD — the repo's `GITHUB_TOKEN` handles authentication automatically)
- **Dokploy** (or another hosting platform) configured to pull from GHCR

## Build Args (Required at Build Time)

Next.js inlines all `NEXT_PUBLIC_*` variables into the JavaScript bundle at build time. These **must** be passed as Docker build args; they cannot be set at runtime.

| Build Arg | Description | Example |
|-----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | Supabase publishable/anon key | `eyJhbG...` |
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | Root domain for subdomain routing | `lmsplatform.com` |
| `NEXT_PUBLIC_APP_URL` | Full application URL | `https://lmsplatform.com` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_live_...` |

If any of these are missing at build time, the corresponding feature will not work in production (the values will be `undefined` in the client bundle).

## Local Docker Build

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://xyz.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY="eyJhbGci..." \
  --build-arg NEXT_PUBLIC_PLATFORM_DOMAIN="lmsplatform.com" \
  --build-arg NEXT_PUBLIC_APP_URL="https://lmsplatform.com" \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..." \
  -t lms-front:local \
  .
```

Run the built image:

```bash
docker run -p 3000:3000 \
  -e SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  -e STRIPE_SECRET_KEY="sk_test_..." \
  -e STRIPE_WEBHOOK_SECRET="whsec_..." \
  -e STRIPE_PLATFORM_WEBHOOK_SECRET="whsec_..." \
  lms-front:local
```

## CI/CD Pipeline

The GitHub Actions workflow at `.github/workflows/deploy.yml` automates the full build-and-deploy cycle.

### Trigger

Pushes to the `master` branch.

### Steps

1. **Checkout** — Clones the repository.
2. **GHCR Login** — Authenticates to `ghcr.io` using the automatic `GITHUB_TOKEN`.
3. **Extract metadata** — Generates image tags: `latest` and the short commit SHA (e.g., `a1b2c3d`).
4. **Build and push** — Builds the Docker image with all `NEXT_PUBLIC_*` build args sourced from GitHub repository **variables** (not secrets), then pushes to `ghcr.io/<owner>/<repo>`.
5. **Trigger Dokploy** — Sends a POST request to the Dokploy webhook URL, which pulls the new `latest` image and redeploys.

### Image Tags

Every push produces two tags:

- `ghcr.io/<owner>/<repo>:latest` — always points to the most recent build
- `ghcr.io/<owner>/<repo>:<sha>` — immutable tag for rollback (e.g., `ghcr.io/org/lms-front:a1b2c3d`)

## GitHub Secrets and Variables

Configure these in your GitHub repository under **Settings > Secrets and variables > Actions**.

### Secrets

| Secret | Description |
|--------|-------------|
| `DOKPLOY_DEPLOY_WEBHOOK_URL` | Dokploy deployment webhook URL (triggers redeploy after image push) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions with `packages: write` permission.

### Variables (not secrets)

These are used as build args and are safe to store as plain variables (they are public keys/URLs that end up in the client bundle anyway).

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | Supabase publishable/anon key |
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | Root domain for subdomain tenant routing |
| `NEXT_PUBLIC_APP_URL` | Full application URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

## Runtime Environment Variables

These are **not** baked into the Docker image. Set them in Dokploy (or your hosting platform's environment configuration).

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Bypasses RLS for admin operations |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key for server-side API calls |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret for Connect (student payments) |
| `STRIPE_PLATFORM_WEBHOOK_SECRET` | Yes | Webhook signing secret for Billing (school plan payments) |

Do **not** add these as Docker build args or GitHub variables — they are secret and only needed at runtime by the Node.js server.

## Troubleshooting

### `canvas` native module / cairo errors

The `canvas` npm package requires native libraries (cairo, pango, libjpeg, etc.). The Dockerfile handles this in two places:

- **deps stage**: Installs build tools (`cairo-dev`, `pango-dev`, `python3`, `make`, `g++`) needed to compile the native addon during `npm ci`.
- **runner stage**: Installs only the runtime libraries (`cairo`, `pango`, `libjpeg-turbo`, etc.) without dev headers.

If you see errors like `Error: libcairo.so.2: cannot open shared object file`, the runner stage is missing a runtime library.

### Port binding / HOSTNAME

The image is configured with:

```
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
```

`HOSTNAME=0.0.0.0` is required so Next.js listens on all interfaces inside the container, not just `localhost`. Without this, the container will appear to start but external connections (including Docker port mapping) will be refused.

### Standalone output requirement

`next.config.ts` must include `output: 'standalone'`. Without it, `npm run build` will not produce the `.next/standalone` directory, and the runner stage `COPY` commands will fail with:

```
COPY failed: file not found in build context
```

### Build fails with missing NEXT_PUBLIC_* values

If you see runtime errors where Supabase or Stripe calls fail with `undefined` URLs/keys, the build args were not passed correctly. Verify:

1. GitHub repository variables are set (Settings > Secrets and variables > Actions > Variables tab).
2. The workflow `build-args` block references `vars.NEXT_PUBLIC_*` (not `secrets.*`).

### Image size

The multi-stage build keeps the final image small (~250-350 MB). If the image grows unexpectedly, check that `.dockerignore` excludes `node_modules`, `.next`, `.git`, `supabase`, `tests`, and `mcp-server`.

### Rollback

To roll back to a previous deployment, re-tag an older SHA image as `latest` and trigger the Dokploy webhook:

```bash
# Find the SHA tag you want to roll back to
docker pull ghcr.io/<owner>/<repo>:<sha>
docker tag ghcr.io/<owner>/<repo>:<sha> ghcr.io/<owner>/<repo>:latest
docker push ghcr.io/<owner>/<repo>:latest

# Trigger redeploy
curl -sSf -X POST "$DOKPLOY_DEPLOY_WEBHOOK_URL"
```
