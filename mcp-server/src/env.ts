/**
 * Centralised environment configuration for the LMS MCP server.
 *
 * The server authenticates clients via Supabase's OAuth 2.1 server
 * (`oauthSupabaseProvider`). Tool handlers then talk to Supabase with an
 * RLS-aware client scoped to the caller's access token, so Postgres RLS
 * enforces tenant isolation and ownership. A separate service-role client is
 * used only for writing audit-log rows.
 */

/** Base URL of the Supabase project (e.g. https://xyz.supabase.co or http://localhost:54321). */
export function getSupabaseUrl(): string {
  const explicit =
    process.env.MCP_USE_OAUTH_SUPABASE_URL || process.env.SUPABASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const projectId = process.env.MCP_USE_OAUTH_SUPABASE_PROJECT_ID;
  if (projectId) return `https://${projectId}.supabase.co`;

  throw new Error(
    "Supabase URL not configured. Set MCP_USE_OAUTH_SUPABASE_URL, SUPABASE_URL, or MCP_USE_OAUTH_SUPABASE_PROJECT_ID."
  );
}

/** Publishable / anon key used to construct request-scoped clients. */
export function getPublishableKey(): string {
  const key =
    process.env.MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
  if (!key) {
    throw new Error(
      "Supabase publishable key not configured. Set MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY."
    );
  }
  return key;
}

/** Service-role key — bypasses RLS. Used ONLY for audit logging. Optional. */
export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

/**
 * Root domain the LMS tenants are served under (e.g. `lmsplatform.com`, or
 * `lvh.me:3000` locally). Optional.
 *
 * Only used to build shareable absolute URLs for things a widget links out to —
 * today the public certificate verification page,
 * `https://<tenant-slug>.<domain>/verify/<code>`. A tenant with its own
 * `tenants.domain` wins over this. When neither is known the widget shows the
 * verification code alone rather than an unclickable guess.
 */
export function getPlatformDomain(): string | undefined {
  const raw =
    process.env.LMS_PLATFORM_DOMAIN ||
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ||
    undefined;
  return raw?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") || undefined;
}

/**
 * Origin of the LMS Next.js app (e.g. `https://lmsplatform.com`, or
 * `http://lvh.me:3000` locally), used to call app routes that must run with
 * the service role — today `POST /api/exercises/evaluate`, the platform grader
 * (#843). Resolution order:
 *
 *   1. `LMS_APP_URL` (explicit).
 *   2. `MCP_URL` / `MCP_SERVER_URL` when it is the app's proxied `/api/mcp`
 *      base — the app origin is that URL minus the suffix.
 *   3. `getPlatformDomain()` — `http://` for lvh.me/localhost/127.*, else
 *      `https://`.
 *
 * Undefined when none is set; callers must degrade (tell the student to use
 * the app) rather than guess.
 */
export function getAppOrigin(): string | undefined {
  const strip = (u: string) => u.trim().replace(/\/+$/, "");

  const explicit = process.env.LMS_APP_URL;
  if (explicit && strip(explicit)) return strip(explicit);

  for (const raw of [process.env.MCP_URL, process.env.MCP_SERVER_URL]) {
    if (!raw) continue;
    const u = strip(raw);
    if (u.endsWith("/api/mcp")) {
      const origin = strip(u.slice(0, -"/api/mcp".length));
      if (origin) return origin;
    }
  }

  const domain = getPlatformDomain();
  if (domain) {
    const local = /^(lvh\.me|localhost|127\.)/.test(domain);
    return `${local ? "http" : "https"}://${domain}`;
  }

  return undefined;
}

/**
 * Legacy HS256 JWT signing secret for `oauthSupabaseProvider`.
 *
 * mcp-use v2 always verifies access tokens: ES256 tokens against the project
 * JWKS, HS256 tokens (local Supabase, or cloud projects still on the legacy
 * signing secret) against this secret. Optional — omit it on projects that
 * have migrated to asymmetric signing keys.
 */
export function getSupabaseJwtSecret(): string | undefined {
  return (
    process.env.MCP_USE_OAUTH_SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    undefined
  );
}

/**
 * Whether the dev-only `lms_demo_*` widget preview tools are registered.
 *
 * These render every MCP App widget from hand-written fixtures (`demo-data.ts`)
 * so the inspector can show a widget with no database and no login. They expose
 * no user data, but they are unauthenticated by design, so they are hard-gated:
 * an explicit opt-in flag AND a non-production NODE_ENV.
 */
export function demoWidgetsEnabled(): boolean {
  return (
    process.env.MCP_DEMO_WIDGETS === "1" && process.env.NODE_ENV !== "production"
  );
}
