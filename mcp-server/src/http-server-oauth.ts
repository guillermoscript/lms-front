#!/usr/bin/env node

/**
 * LMS MCP HTTP Server with OAuth 2.1 Authorization Server (Multi-Tenant)
 *
 * This server acts as BOTH the OAuth Authorization Server AND the Resource Server.
 * It sits behind the Next.js catch-all proxy at /api/mcp/[[...path]].
 *
 * Multi-tenant design:
 * - The Next.js proxy serves OAuth metadata (/.well-known/*) directly,
 *   constructing tenant-specific URLs from the Host header
 * - The proxy forwards X-Origin header so this server knows which tenant
 *   subdomain to redirect to for the consent page
 * - Each tenant (school1.platform.com, school2.platform.com) gets a
 *   correctly-scoped OAuth flow without any per-tenant configuration
 *
 * Endpoints handled by this server (behind the proxy):
 *   /auth/authorize  → redirects to tenant consent page
 *   /auth/token      → code → JWT exchange
 *   /auth/register   → dynamic client registration
 *   /auth/callback   → receives consent result, issues auth code
 *   /mcp             → protected MCP endpoint (Bearer JWT)
 *   /health          → health check
 *
 * Flow for Claude Desktop:
 *   1. User adds school.platform.com/api/mcp in Settings > Connectors
 *   2. Claude GETs /.well-known/oauth-protected-resource (served by proxy)
 *   3. Claude registers via /auth/register → forwarded here
 *   4. Claude hits /auth/authorize → this server redirects to tenant consent
 *   5. User logs in + approves → consent page POSTs to /auth/callback
 *   6. This server generates auth code → redirects back to Claude
 *   7. Claude exchanges code for JWT at /auth/token
 *   8. Claude calls /mcp with Bearer JWT
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { IncomingMessage, ServerResponse } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { AuthManager, loadOAuthResourceConfig, UserContext, OAuthResourceConfig } from "./auth.js";
import { SupabaseOAuthProvider } from "./oauth/supabase-oauth-provider.js";
import { registerCourseTools } from "./tools/courses.js";
import { registerLessonTools } from "./tools/lessons.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerExamTools } from "./tools/exams.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const PORT = parseInt(process.env.MCP_SERVER_PORT || "3001", 10);
const HOST = process.env.MCP_SERVER_HOST || "127.0.0.1";

// Load auth config
let authConfig: OAuthResourceConfig;
try {
  authConfig = loadOAuthResourceConfig();
  console.error(`[Config] OAuth Authorization + Resource Server mode`);
  console.error(`[Config] Supabase URL: ${authConfig.supabaseUrl}`);
} catch (error) {
  console.error("Failed to load auth config:", error);
  process.exit(1);
}

// Create OAuth provider (no hardcoded URL — origin comes from request headers)
const oauthProvider = new SupabaseOAuthProvider();

// Issuer URL for mcpAuthRouter — this is the internal address.
// The proxy rewrites metadata for the actual public URLs, so this is
// only used for the SDK's internal routing.
const issuerUrl = new URL(`http://${HOST}:${PORT}`);

/**
 * Create a server factory that registers tools with a given auth manager.
 */
function createServerWithAuth(auth: AuthManager): McpServer {
  const server = new McpServer({
    name: "lms-mcp-server",
    version: "1.0.0",
  });

  registerCourseTools(server, auth);
  registerLessonTools(server, auth);
  registerExerciseTools(server, auth);
  registerExamTools(server, auth);
  registerAnalyticsTools(server, auth);
  registerResources(server, auth);
  registerPrompts(server);

  return server;
}

// Create Express app
const app = express();

// OAuth auth router — handles /auth/authorize, /auth/token, /auth/register
// Note: The proxy overrides /.well-known/* with tenant-aware metadata,
// so mcpAuthRouter's metadata will only be seen if accessed directly.
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl,
    scopesSupported: ["mcp:tools"],
    resourceName: "LMS MCP Server",
  })
);

// JSON body parsing (after auth router, which has its own parsing)
app.use(express.json());

// Bearer auth middleware for /mcp endpoint
const bearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  resourceMetadataUrl: `${issuerUrl.origin}/.well-known/oauth-protected-resource`,
});

/**
 * POST /auth/callback — receives user identity from consent page
 *
 * After the user approves on the tenant's consent page, it POSTs here
 * (via the proxy) with: { sessionId, userId, userRole, tenantId }
 *
 * This generates an authorization code and redirects to the client's redirect_uri.
 */
app.post("/auth/callback", (req, res) => {
  try {
    const { sessionId, userId, userRole, tenantId } = req.body;

    if (!sessionId || !userId || !userRole || !tenantId) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Missing required fields: sessionId, userId, userRole, tenantId",
      });
      return;
    }

    if (userRole !== "teacher" && userRole !== "admin") {
      res.status(403).json({
        error: "access_denied",
        error_description: "Only teachers and admins can authorize MCP access",
      });
      return;
    }

    const { code, redirectUri, state } = oauthProvider.completeAuthorization(
      sessionId,
      userId,
      userRole,
      tenantId
    );

    const targetUrl = new URL(redirectUri);
    targetUrl.searchParams.set("code", code);
    if (state) {
      targetUrl.searchParams.set("state", state);
    }

    console.error(`[OAuth Callback] Auth code issued for tenant ${tenantId}, redirecting to client`);
    res.redirect(targetUrl.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[OAuth Callback] Error: ${message}`);
    res.status(400).json({
      error: "invalid_request",
      error_description: message,
    });
  }
});

/**
 * GET /auth/callback — handles consent page redirects (browser navigation)
 */
app.get("/auth/callback", (req, res) => {
  try {
    const sessionId = req.query.session_id as string;
    const userId = req.query.user_id as string;
    const userRole = req.query.user_role as string;
    const tenantId = req.query.tenant_id as string;

    if (!sessionId || !userId || !userRole || !tenantId) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Missing required query params: session_id, user_id, user_role, tenant_id",
      });
      return;
    }

    if (userRole !== "teacher" && userRole !== "admin") {
      res.status(403).json({
        error: "access_denied",
        error_description: "Only teachers and admins can authorize MCP access",
      });
      return;
    }

    const { code, redirectUri, state } = oauthProvider.completeAuthorization(
      sessionId,
      userId,
      userRole as "teacher" | "admin",
      tenantId
    );

    const targetUrl = new URL(redirectUri);
    targetUrl.searchParams.set("code", code);
    if (state) {
      targetUrl.searchParams.set("state", state);
    }

    console.error(`[OAuth Callback GET] Auth code issued, redirecting to client`);
    res.redirect(targetUrl.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[OAuth Callback GET] Error: ${message}`);
    res.status(400).json({
      error: "invalid_request",
      error_description: message,
    });
  }
});

// MCP endpoint (protected by OAuth bearer token)
app.post("/mcp", bearerAuth, async (req, res) => {
  const authInfo = req.auth!;
  const userContext: UserContext = {
    userId: authInfo.extra?.userId as string,
    userRole: authInfo.extra?.userRole as "teacher" | "admin",
    tenantId: (authInfo.extra?.tenantId as string) || "00000000-0000-0000-0000-000000000001",
  };

  const startTime = Date.now();
  let auth: AuthManager | null = null;

  try {
    auth = new AuthManager(authConfig, userContext);
    await auth.initialize();

    const mcpServer = createServerWithAuth(auth);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch((err) => {
        console.error("[Transport] Error closing transport:", err);
      });
    });

    await mcpServer.connect(transport);

    const method = req.body?.method || "unknown";
    const toolName = req.body?.params?.name || null;
    const params = req.body?.params?.arguments || {};

    await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);

    if (auth && method === "tools/call" && toolName) {
      const duration = Date.now() - startTime;
      await auth.logAction(method, toolName, params, true, undefined, duration);
    }

    console.error(
      `[${new Date().toISOString()}] MCP request: ${userContext.userRole} (${userContext.userId}) tenant ${userContext.tenantId}`
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Error] MCP request failed: ${errorMsg}`);

    if (auth && req.body?.method === "tools/call" && req.body?.params?.name) {
      const duration = Date.now() - startTime;
      await auth.logAction(
        req.body.method,
        req.body.params.name,
        req.body.params?.arguments || {},
        false,
        errorMsg,
        duration
      );
    }

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: `Internal error: ${errorMsg}`,
        },
      });
    }
  }
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "lms-mcp-server",
    version: "2.0.0",
    authMode: "oauth-authorization-server",
    multiTenant: true,
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.error(`╔════════════════════════════════════════════════════════════╗`);
  console.error(`║  LMS MCP HTTP Server (OAuth 2.1 — Multi-Tenant)           ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Status:   READY                                           ║`);
  console.error(`║  Address:  http://${HOST}:${PORT.toString().padEnd(37)} ║`);
  console.error(`║  Mode:     OAuth 2.1 Auth + Resource Server                ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Multi-Tenant:                                             ║`);
  console.error(`║    Proxy serves /.well-known/* with per-tenant URLs       ║`);
  console.error(`║    authorize() reads X-Origin for consent redirect        ║`);
  console.error(`║    Each subdomain gets its own OAuth flow automatically   ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Auth Endpoints (behind proxy):                            ║`);
  console.error(`║    • /auth/register  (Dynamic Client Registration)        ║`);
  console.error(`║    • /auth/authorize (→ tenant consent page)              ║`);
  console.error(`║    • /auth/token     (code → JWT exchange)                ║`);
  console.error(`║    • /auth/callback  (consent result → auth code)         ║`);
  console.error(`║    • POST /mcp       (Bearer JWT required)                ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Registered: 27 tools · 3 resources · 4 prompts           ║`);
  console.error(`╚════════════════════════════════════════════════════════════╝`);
});

// Graceful shutdown
const shutdown = async () => {
  console.error("\n[Shutdown] Shutting down gracefully...");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (error) => {
  console.error("[Fatal] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Fatal] Unhandled rejection:", reason);
  process.exit(1);
});
