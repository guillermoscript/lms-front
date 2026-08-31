import type { MCPServer } from "mcp-use";
import type { SupabaseOAuthUser } from "mcp-use/oauth/supabase";

/**
 * The concrete server type every registration module accepts.
 *
 * The OAuth provider fixes the user type parameter, and mcp-use v2 threads it
 * through to callback contexts (`ctx.auth.user`). Handlers never read
 * `ctx.auth` directly — `LmsSession.fromContext` does — but the alias keeps
 * `server.tool(...)` calls type-checked against the real instance built in
 * `index.ts`. In demo-widget mode the server is constructed without OAuth and
 * cast to this type; every real tool still refuses to run without a session.
 */
export type LmsServer = MCPServer<SupabaseOAuthUser>;
