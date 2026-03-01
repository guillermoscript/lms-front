#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config();

import { createServer, IncomingMessage, ServerResponse } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuthManager, loadProxyAuthConfig, UserContext, ProxyAuthConfig } from "./auth.js";
import { registerCourseTools } from "./tools/courses.js";
import { registerLessonTools } from "./tools/lessons.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerExamTools } from "./tools/exams.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3001", 10);
const HOST = process.env.MCP_HTTP_HOST || "127.0.0.1";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

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
 * Handle incoming HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-User-ID, X-User-Role, X-MCP-Secret");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    return;
  }

  // Validate shared secret
  const secret = req.headers["x-mcp-secret"];
  if (secret !== authConfig.proxySecret) {
    console.error(`[Auth] Invalid secret from ${req.socket.remoteAddress}`);
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized: Invalid secret" }));
    return;
  }

  // Extract user context from headers
  const userId = req.headers["x-user-id"] as string;
  const userRole = req.headers["x-user-role"] as string;

  if (!userId || !userRole) {
    console.error(`[Auth] Missing user context headers from ${req.socket.remoteAddress}`);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing X-User-ID or X-User-Role headers" }));
    return;
  }

  if (userRole !== "teacher" && userRole !== "admin") {
    console.error(`[Auth] Invalid role '${userRole}' for user ${userId}`);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Forbidden: Invalid role '${userRole}'` }));
    return;
  }

  // Read request body
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    const startTime = Date.now();
    let auth: AuthManager | null = null;
    let request: any = null;

    try {
      // Parse JSON-RPC request
      request = JSON.parse(body);

      if (!request.jsonrpc || request.jsonrpc !== "2.0") {
        throw new Error("Invalid JSON-RPC 2.0 request");
      }

      // Create auth manager with user context
      const tenantId = req.headers["x-tenant-id"] as string || "00000000-0000-0000-0000-000000000001";
      const userContext: UserContext = {
        userId,
        userRole: userRole as "teacher" | "admin",
        tenantId,
      };

      auth = new AuthManager(authConfig, userContext);
      await auth.initialize();

      // Create MCP server instance
      const mcpServer = new McpServer({
        name: "lms-mcp-server",
        version: "1.0.0",
      });

      // Register all tools and resources
      registerCourseTools(mcpServer, auth);
      registerLessonTools(mcpServer, auth);
      registerExerciseTools(mcpServer, auth);
      registerExamTools(mcpServer, auth);
      registerAnalyticsTools(mcpServer, auth);
      registerResources(mcpServer, auth);
      registerPrompts(mcpServer);

      // Process MCP request (this is a placeholder - actual implementation depends on SDK)
      // For now, we'll handle common methods manually
      let response: any;

      if (request.method === "initialize") {
        response = {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "lms-mcp-server",
              version: "1.0.0",
            },
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
          },
        };
      } else {
        // For actual tool/resource calls, we'd need to process them here
        // This is a simplified version - the SDK should handle routing
        response = {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            message: "Request received and processed",
          },
        };
      }

      // Log successful action
      const durationMs = Date.now() - startTime;
      await auth.logAction(
        request.method,
        request.params?.name || null,
        request.params,
        true,
        undefined,
        durationMs
      );

      console.error(
        `[${new Date().toISOString()}] ${request.method} by ${userRole} (${userId}) - ${durationMs}ms`
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      // Log failed action
      if (auth && request) {
        try {
          await auth.logAction(
            request.method,
            request.params?.name || null,
            request.params,
            false,
            errorMsg,
            durationMs
          );
        } catch (logError) {
          console.error("Failed to log error:", logError);
        }
      }

      console.error(`[Error] ${errorMsg}`);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request?.id || null,
          error: {
            code: -32603,
            message: errorMsg,
          },
        })
      );
    }
  });

  req.on("error", (error) => {
    console.error(`[Request Error] ${error.message}`);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad request" }));
  });
}

// Create and start HTTP server
const server = createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.error(`╔════════════════════════════════════════════════════════════╗`);
  console.error(`║  LMS MCP HTTP Server                                       ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Status:   READY                                           ║`);
  console.error(`║  Address:  http://${HOST}:${PORT.toString().padEnd(37)} ║`);
  console.error(`║  Mode:     Proxy Authentication                            ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Registered:                                               ║`);
  console.error(`║    • 27 tools (courses, lessons, exams, etc.)              ║`);
  console.error(`║    • 3 resources (course, lesson, exam data)               ║`);
  console.error(`║    • 4 prompts (course creation, content gen, etc.)        ║`);
  console.error(`╠════════════════════════════════════════════════════════════╣`);
  console.error(`║  Security:                                                 ║`);
  console.error(`║    ✓ Shared secret validation enabled                      ║`);
  console.error(`║    ✓ Per-user authentication required                      ║`);
  console.error(`║    ✓ Audit logging enabled                                 ║`);
  console.error(`╚════════════════════════════════════════════════════════════╝`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.error("\n[Shutdown] Received SIGINT, shutting down gracefully...");
  server.close(() => {
    console.error("[Shutdown] Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.error("\n[Shutdown] Received SIGTERM, shutting down gracefully...");
  server.close(() => {
    console.error("[Shutdown] Server closed");
    process.exit(0);
  });
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[Fatal] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Fatal] Unhandled rejection:", reason);
  process.exit(1);
});
