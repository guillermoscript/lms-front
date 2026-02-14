#!/usr/bin/env node

/**
 * LMS MCP HTTP Server (Direct Auth)
 *
 * HTTP server for local development with Claude Code.
 * Authenticates once on startup with email/password, then serves
 * MCP requests over HTTP without requiring proxy headers.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_USER_EMAIL=... SUPABASE_USER_PASSWORD=... node build/http-server-direct.js
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { IncomingMessage, ServerResponse } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuthManager, loadDirectAuthConfig } from "./auth.js";
import { registerCourseTools } from "./tools/courses.js";
import { registerLessonTools } from "./tools/lessons.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerExamTools } from "./tools/exams.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const PORT = parseInt(process.env.MCP_SERVER_PORT || "3001", 10);
const HOST = process.env.MCP_SERVER_HOST || "127.0.0.1";

async function main() {
  // Load and validate auth config
  const authConfig = loadDirectAuthConfig();

  // Authenticate once on startup
  const auth = new AuthManager(authConfig);
  await auth.initialize();

  console.error(`[Auth] Authenticated as ${auth.getRole()} (${auth.getUserId()})`);

  // Create Express app
  const app = express();
  app.use(express.json());

  // MCP endpoint - reuses the pre-authenticated AuthManager
  app.post("/mcp", async (req, res) => {
    try {
      // Create MCP server instance for this request
      const mcpServer = new McpServer({
        name: "lms-mcp-server",
        version: "1.0.0",
      });

      // Register all tools with the pre-authenticated auth
      registerCourseTools(mcpServer, auth);
      registerLessonTools(mcpServer, auth);
      registerExerciseTools(mcpServer, auth);
      registerExamTools(mcpServer, auth);
      registerAnalyticsTools(mcpServer, auth);
      registerResources(mcpServer, auth);
      registerPrompts(mcpServer);

      // Create transport (stateless mode)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      res.on("close", () => {
        transport.close().catch((err) => {
          console.error("[Transport] Error closing:", err);
        });
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Error] MCP request failed: ${errorMsg}`);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: `Internal error: ${errorMsg}` },
        });
      }
    }
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "lms-mcp-server", mode: "direct-auth", user: auth.getUserId(), role: auth.getRole() });
  });

  // Start server
  app.listen(PORT, HOST, () => {
    console.error(`LMS MCP Server (Direct Auth) ready at http://${HOST}:${PORT}/mcp`);
    console.error(`  User: ${auth.getUserId()} (${auth.getRole()})`);
    console.error(`  Tools: 27 | Resources: 3 | Prompts: 4`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.error("\nShutting down...");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
