#!/usr/bin/env node

/**
 * LMS MCP HTTP Server (v2)
 * 
 * This server uses the MCP SDK's StreamableHTTPServerTransport with Express
 * to provide a proper MCP implementation with HTTP proxy authentication.
 * 
 * Architecture:
 * - Express app with custom middleware for auth validation
 * - User context attached to request via req.auth
 * - AsyncLocalStorage for per-request auth context
 * - StreamableHTTPServerTransport handles JSON-RPC routing
 * - All tools auto-registered and accessible via getAuthContext()
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { IncomingMessage, ServerResponse } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { AuthManager, loadProxyAuthConfig, UserContext, ProxyAuthConfig } from "./auth.js";
import { runWithAuthContext } from "./auth-context.js";
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
let authConfig: ProxyAuthConfig;
try {
  authConfig = loadProxyAuthConfig();
  console.error(`[Config] Proxy secret configured: ${authConfig.proxySecret.substring(0, 8)}...`);
} catch (error) {
  console.error("Failed to load auth config:", error);
  process.exit(1);
}

/**
 * Create a server factory that registers tools with a given auth manager.
 * Per-request auth context is bound to the auth manager passed in.
 */
function createServerWithAuth(auth: AuthManager): McpServer {
  const server = new McpServer({
    name: "lms-mcp-server",
    version: "1.0.0",
  });

  // Register all tools, resources, and prompts with this auth instance
  registerCourseTools(server, auth);
  registerLessonTools(server, auth);
  registerExerciseTools(server, auth);
  registerExamTools(server, auth);
  registerAnalyticsTools(server, auth);
  registerResources(server, auth);
  registerPrompts(server);

  return server;
}

// Create Express app with MCP defaults (includes DNS rebinding protection)
const app = createMcpExpressApp({ host: HOST });

// Add JSON body parsing
app.use(express.json());

// Custom middleware: Validate authentication headers
app.use((req, res, next) => {
  // Skip for OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return next();
  }

  // Validate shared secret
  const secret = req.headers["x-mcp-secret"] as string;
  if (secret !== authConfig.proxySecret) {
    console.error(`[Auth] Invalid secret from ${req.socket.remoteAddress}`);
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized: Invalid secret",
      },
    });
  }

  // Extract user context
  const userId = req.headers["x-user-id"] as string;
  const userRole = req.headers["x-user-role"] as string;

  if (!userId || !userRole) {
    console.error(`[Auth] Missing user context headers from ${req.socket.remoteAddress}`);
    return res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32002,
        message: "Bad Request: Missing X-User-ID or X-User-Role headers",
      },
    });
  }

  if (userRole !== "teacher" && userRole !== "admin") {
    console.error(`[Auth] Invalid role '${userRole}' for user ${userId}`);
    return res.status(403).json({
      jsonrpc: "2.0",
      error: {
        code: -32003,
        message: `Forbidden: Invalid role '${userRole}'`,
      },
    });
  }

  // Attach user context to request (will be used by transport)
  (req as any).userContext = {
    userId,
    userRole: userRole as "teacher" | "admin",
  };

  console.error(`[Auth] Validated ${userRole} (${userId})`);
  next();
});

// MCP endpoint
app.post("/mcp", async (req, res) => {
  const userContext = (req as any).userContext as UserContext;
  const startTime = Date.now();
  let auth: AuthManager | null = null;
  
  try {
    // Create AuthManager for this request
    auth = new AuthManager(authConfig, userContext);
    await auth.initialize();

    // Create MCP server instance for this request with auth context
    const mcpServer = createServerWithAuth(auth);

    // Create a new transport instance for this request (stateless mode)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true,
    });

    // Handle cleanup when response finishes
    res.on("close", () => {
      transport.close().catch((err) => {
        console.error("[Transport] Error closing transport:", err);
      });
    });

    // Connect the MCP server to the transport
    await mcpServer.connect(transport);

    // Log the request for audit purposes
    const requestBody = req.body;
    const method = requestBody?.method || 'unknown';
    const toolName = requestBody?.params?.name || null;
    const params = requestBody?.params?.arguments || {};

    // Handle the HTTP request via the transport
    // The transport will parse JSON-RPC and route to appropriate tools
    await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);

    // Log successful request to audit table
    if (auth && method === 'tools/call' && toolName) {
      const duration = Date.now() - startTime;
      await auth.logAction(method, toolName, params, true, undefined, duration);
    }

    console.error(
      `[${new Date().toISOString()}] MCP request handled for ${userContext.userRole} (${userContext.userId})`
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Error] MCP request failed: ${errorMsg}`);

    // Log failed request to audit table
    if (auth && req.body?.method === 'tools/call' && req.body?.params?.name) {
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
app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "lms-mcp-server", version: "2.0.0" });
});

// Start server
app.listen(PORT, HOST, () => {
  console.error(`╔════════════════════════════════════════════════════════════╗`);
  console.error(`║  LMS MCP HTTP Server v2                                    ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Status:   READY                                           ║`);
  console.error(`║  Address:  http://${HOST}:${PORT.toString().padEnd(37)} ║`);
  console.error(`║  Endpoint: POST /mcp                                       ║`);
  console.error(`║  Health:   GET /health                                     ║`);
  console.error(`║  Mode:     Proxy Authentication (Stateless)                ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Registered:                                               ║`);
  console.error(`║    • 27 tools (courses, lessons, exams, etc.)              ║`);
  console.error(`║    • 3 resources (course, lesson, exam data)               ║`);
  console.error(`║    • 4 prompts (course creation, content gen, etc.)        ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Security:                                                 ║`);
  console.error(`║    ✓ Shared secret validation enabled                      ║`);
  console.error(`║    ✓ Per-request authentication required                   ║`);
  console.error(`║    ✓ Audit logging enabled                                 ║`);
  console.error(`║    ✓ DNS rebinding protection enabled                      ║`);
  console.error(`╚════════════════════════════════════════════════════════════╝`);
});

// Graceful shutdown
const shutdown = async () => {
  console.error("\n[Shutdown] Shutting down gracefully...");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[Fatal] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Fatal] Unhandled rejection:", reason);
  process.exit(1);
});
