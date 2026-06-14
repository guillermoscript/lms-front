import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getPublishableKey, getServiceRoleKey } from "./env.js";

/**
 * Build a Supabase client scoped to the caller's access token.
 *
 * Every query runs as the authenticated user, so Row Level Security policies
 * (tenant isolation, ownership) are enforced by Postgres — the MCP server does
 * not hold elevated privileges for data access.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(getSupabaseUrl(), getPublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

let serviceClient: SupabaseClient | null = null;

/**
 * Service-role client used ONLY for audit logging (bypasses RLS).
 * Returns null when no service-role key is configured, in which case audit
 * logging is skipped silently.
 */
export function getServiceClient(): SupabaseClient | null {
  const key = getServiceRoleKey();
  if (!key) return null;
  if (!serviceClient) {
    serviceClient = createClient(getSupabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}
