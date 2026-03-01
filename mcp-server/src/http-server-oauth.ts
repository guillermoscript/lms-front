#!/usr/bin/env node

/**
 * LMS MCP HTTP Server with OAuth 2.1 Authentication
 *
 * This server uses Supabase as the OAuth 2.1 Authorization Server.
 * It acts as a Resource Server that:
 * 1. Advertises OAuth metadata via /.well-known/oauth-protected-resource
 * 2. Validates Bearer tokens (Supabase JWTs) via JWKS
 * 3. Extracts user_role from JWT claims (injected by custom_access_token_hook)
 * 4. Creates per-request AuthManager with user context from the verified JWT
 *
 * Flow:
 *   MCP Client → discovers OAuth via well-known → redirects to Supabase Auth
 *   → user logs in + consents → Supabase issues JWT → client sends Bearer token
 *   → this server verifies JWT via JWKS → processes MCP request with user context
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { IncomingMessage, ServerResponse } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { AuthManager, loadOAuthResourceConfig, UserContext, OAuthResourceConfig } from "./auth.js";
import { SupabaseTokenVerifier } from "./oauth/token-verifier.js";
import { registerCourseTools } from "./tools/courses.js";
import { registerLessonTools } from "./tools/lessons.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerExamTools } from "./tools/exams.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

const PORT = parseInt(process.env.MCP_SERVER_PORT || "3001", 10);
const HOST = process.env.MCP_SERVER_HOST || "127.0.0.1";

// Load auth config
let authConfig: OAuthResourceConfig;
try {
  authConfig = loadOAuthResourceConfig();
  console.error(`[Config] OAuth Resource Server mode`);
  console.error(`[Config] Supabase URL: ${authConfig.supabaseUrl}`);
} catch (error) {
  console.error("Failed to load auth config:", error);
  process.exit(1);
}

// Create token verifier
const tokenVerifier = new SupabaseTokenVerifier({
  supabaseUrl: authConfig.supabaseUrl,
});

// Build OAuth metadata pointing to Supabase Auth endpoints
const supabaseAuthBase = `${authConfig.supabaseUrl}/auth/v1`;
const oauthMetadata = {
  issuer: supabaseAuthBase,
  authorization_endpoint: `${supabaseAuthBase}/oauth/authorize`,
  token_endpoint: `${supabaseAuthBase}/oauth/token`,
  registration_endpoint: `${supabaseAuthBase}/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["openid", "profile", "email"],
} satisfies OAuthMetadata;

const resourceServerUrl = new URL(`http://${HOST}:${PORT}`);

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

// Auth metadata router — serves /.well-known/oauth-protected-resource
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl,
    resourceName: "LMS MCP Server",
    scopesSupported: ["openid", "profile", "email"],
  })
);

// JSON body parsing
app.use(express.json());

// Bearer auth middleware for /mcp endpoint
const bearerAuth = requireBearerAuth({
  verifier: tokenVerifier,
  resourceMetadataUrl: `${resourceServerUrl.origin}/.well-known/oauth-protected-resource`,
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
      sessionIdGenerator: undefined, // Stateless mode
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
      `[${new Date().toISOString()}] MCP request handled for ${userContext.userRole} (${userContext.userId})`
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
    authMode: "oauth-resource",
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.error(`╔════════════════════════════════════════════════════════════╗`);
  console.error(`║  LMS MCP HTTP Server (OAuth 2.1)                          ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Status:   READY                                           ║`);
  console.error(`║  Address:  http://${HOST}:${PORT.toString().padEnd(37)} ║`);
  console.error(`║  Endpoint: POST /mcp                                       ║`);
  console.error(`║  Health:   GET /health                                     ║`);
  console.error(`║  Mode:     OAuth 2.1 Resource Server (Stateless)           ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Auth Server: ${supabaseAuthBase.padEnd(42)} ║`);
  console.error(`║  Metadata:  /.well-known/oauth-protected-resource         ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Registered:                                               ║`);
  console.error(`║    • 27 tools (courses, lessons, exams, etc.)              ║`);
  console.error(`║    • 3 resources (course, lesson, exam data)               ║`);
  console.error(`║    • 4 prompts (course creation, content gen, etc.)        ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Security:                                                 ║`);
  console.error(`║    ✓ OAuth 2.1 bearer token validation (JWKS)             ║`);
  console.error(`║    ✓ Per-request authentication required                   ║`);
  console.error(`║    ✓ Role-based access control (teacher/admin only)        ║`);
  console.error(`║    ✓ Audit logging enabled                                 ║`);
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
