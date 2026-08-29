FROM node:24-slim AS base

# Install dependencies
FROM base AS deps
# canvas ships a prebuilt glibc binary on Debian, so only its runtime shared
# libraries are needed here — no compiler toolchain required.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# Workspace package manifests must exist at install time so npm links
# @lms/core into node_modules (source-only package via transpilePackages).
COPY packages/core/package.json ./packages/core/package.json
# `npm ci`, NOT `npm install` with the lockfile deleted.
#
# This used to be `rm -f package-lock.json && npm install`, to work around an
# old npm bug that skipped platform-specific optional native deps
# (lightningcss / Tailwind v4 oxide / sharp) when a lockfile was present. That
# workaround cost six days of production deploys: discarding the lockfile makes
# every caret range re-resolve at image-build time, so a dependency's new MINOR
# lands in production without any commit and without CI ever seeing it. stripe
# 22.6.0 did exactly that — it moved the `apiVersion` literal its own types
# demand, and `npm run build` failed here while master stayed green.
#
# The workaround is also no longer needed: this is a lockfileVersion 3 lockfile,
# which records EVERY platform variant regardless of where it was generated
# (`lightningcss-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, the sharp
# linux set are all in there), and npm installs the ones matching os/cpu.
# `--include=optional` is kept explicit so a future `--omit=optional` default
# cannot quietly strip them again.
#
# The image build now runs in CI too (.github/workflows/ci.yml), so a break here
# fails the PR rather than the deploy.
RUN npm ci --include=optional --legacy-peer-deps

# Build
FROM base AS builder
WORKDIR /app
# sentry-cli is a static Rust binary with its own TLS stack, so it reads the OS
# CA bundle — unlike Node, which bundles its own and therefore made npm work
# here while every sentry-cli call failed with
#   [60] SSL certificate problem: unable to get local issuer certificate
# The `deps` stage installs system packages; this stage never did, so the source
# map upload has failed on every build this image has ever produced.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js inlines NEXT_PUBLIC_* at build time — pass as build args
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
ARG NEXT_PUBLIC_PLATFORM_DOMAIN
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN

# Not NEXT_PUBLIC_, but still build-time only: withSentryConfig uses it to upload
# source maps during `npm run build`. Without it every browser stack in Sentry is
# unreadable minified chunk offsets. It is consumed in this stage and never
# reaches the `runner` stage, so it is not present in the shipped image.
ARG SENTRY_AUTH_TOKEN

# The release name the uploaded source maps are keyed to. It has to be passed
# in: `.dockerignore` excludes `.git`, so the Sentry plugin cannot infer a
# release from the repo the way it does on a dev machine, and without one the
# upload is skipped. deploy.yml passes github.sha.
ARG SENTRY_RELEASE

# next.config.ts sets `silent: !process.env.CI`, and CI is a GitHub Actions
# runner variable that does NOT cross into this container — so the plugin ran
# completely silently here and a skipped upload looked identical to a
# successful one. Set it so the upload (or its failure) shows up in the build
# log.
ENV CI=true

# sentry-cli reported only "failed with exit code 1" for both `releases new`
# and `sourcemaps upload`, and told us to set this to see why. Keep it: the
# upload runs once per deploy, so the extra output costs nothing and is the
# difference between a diagnosable failure and a silent one.
ENV SENTRY_LOG_LEVEL=debug

# Explicit rather than inferred. Note these were NOT the cause of the upload
# failing — the debug log showed `releases new` already sending
# {"projects":["lms-front"]} — but stating them costs nothing and removes a
# variable from the next investigation.
ENV SENTRY_ORG=guillermoscript
ENV SENTRY_PROJECT=lms-front

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
ENV NEXT_PUBLIC_PLATFORM_DOMAIN=$NEXT_PUBLIC_PLATFORM_DOMAIN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV SENTRY_RELEASE=$SENTRY_RELEASE

RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime shared libraries for canvas/sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
