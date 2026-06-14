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

/** Whether JWTs should be cryptographically verified (disable only in local dev). */
export function shouldVerifyJwt(): boolean {
  return process.env.NODE_ENV === "production";
}
