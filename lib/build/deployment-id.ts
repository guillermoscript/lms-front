/**
 * The build's deployment identifier, read at build time by `next.config.ts`.
 *
 * Next.js uses it for version-skew protection: it stamps `?dpl=<id>` on every
 * static asset, sends `x-deployment-id` with client navigations and Server
 * Action requests, and returns `x-nextjs-deployment-id` on navigation
 * responses. A client still holding the previous deployment's bundle sees the
 * mismatch and performs a hard navigation instead of firing requests the new
 * deployment cannot serve — which is the condition behind LMS-FRONT-82
 * (`Failed to find Server Action`, issue #679).
 *
 * Nothing about this is Sentry-specific; `SENTRY_RELEASE` is simply where the
 * commit SHA already lives. `.github/workflows/deploy.yml` passes `github.sha`
 * as a Docker build arg and the Dockerfile exports it before `npm run build`,
 * so it is the one value that is (a) unique per deploy and (b) already present
 * at build time. `.dockerignore` excludes `.git`, so the SHA cannot be inferred
 * from the repo inside the image. `NEXT_DEPLOYMENT_ID` — Next's own convention
 * — wins when set, so an operator can override without touching Sentry.
 *
 * Unset (local dev, `npm run build` on a laptop) resolves to `undefined`, which
 * is exactly "no deployment id" and leaves Next's behaviour unchanged.
 */
export function resolveDeploymentId(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const candidate = env.NEXT_DEPLOYMENT_ID ?? env.SENTRY_RELEASE
  const trimmed = candidate?.trim()
  return trimmed ? trimmed : undefined
}
