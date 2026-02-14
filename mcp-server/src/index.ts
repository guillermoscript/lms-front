#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AuthManager, loadAuthConfig } from "./auth.js";
import { registerCourseTools } from "./tools/courses.js";
import { registerLessonTools } from "./tools/lessons.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerExamTools } from "./tools/exams.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

async function main() {
  try {
    // Validate and load auth config
    const authConfig = loadAuthConfig();
    console.error("LMS MCP Server starting...");

    // Authenticate
    const auth = new AuthManager(authConfig);
    await auth.initialize();

    // Create MCP server
    const server = new McpServer({
      name: "lms-mcp-server",
      version: "1.0.0",
    });

    // Register all tools
    registerCourseTools(server, auth);
    registerLessonTools(server, auth);
    registerExerciseTools(server, auth);
    registerExamTools(server, auth);
    registerAnalyticsTools(server, auth);

    // Register resources and prompts
    registerResources(server, auth);
    registerPrompts(server);

    console.error("Registered 27 tools, 3 resources, 4 prompts");

    // Start stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("LMS MCP Server connected and ready");
  } catch (error) {
    console.error("Fatal:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
