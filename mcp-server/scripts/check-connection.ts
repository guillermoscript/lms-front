import { existsSync } from "node:fs";
import { getPublishableKey, getSupabaseUrl } from "../src/env.js";

// Like mcp-use, a standalone server reads its own .env, not the app's .env.local.
// Explicit deployment environment variables win over values in that file.
if (existsSync(".env")) process.loadEnvFile(".env");

try {
  const url = getSupabaseUrl();
  const key = getPublishableKey();
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) {
    // Do not echo upstream bodies or credential values to logs.
    throw new Error(
      `Supabase public-key check failed (HTTP ${response.status}). Verify the URL and public key belong to the same project and that the key has not been revoked. An MCP_USE_OAUTH_SUPABASE_* value overrides its fallback variables.`
    );
  }
  console.log("Supabase accepted the MCP server's public API key. OAuth identity, tenant claims, and RLS must still be checked with an authenticated MCP tool call.");
} catch (err) {
  // Configuration errors are written by us and contain no credential values.
  // Network errors are generic to avoid exposing unexpected request details.
  const message = err instanceof Error && (err.message.startsWith("Supabase ") || err.message.startsWith("Supabase public-key"))
    ? err.message
    : "Could not reach Supabase. Check the configured URL, network access, and TLS certificate.";
  console.error(message);
  process.exitCode = 1;
}
