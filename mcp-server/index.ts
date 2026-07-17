import { MCPServer, oauthSupabaseProvider } from "mcp-use/server";
import { getSupabaseUrl, shouldVerifyJwt } from "./src/env.js";
import { installToolGuards } from "./src/register.js";
import { installToolPolicy } from "./src/tool-policy.js";
import { installAuthRoutes } from "./src/auth-routes.js";
import { registerCourseTools } from "./src/tools/courses.js";
import { registerLessonTools } from "./src/tools/lessons.js";
import { registerExerciseTools } from "./src/tools/exercises.js";
import { registerExamTools } from "./src/tools/exams.js";
import { registerAnalyticsTools } from "./src/tools/analytics.js";
import { registerStudentTools } from "./src/tools/student.js";
import { registerPracticeTools } from "./src/tools/practice.js";
import { registerIngestTools } from "./src/tools/ingest.js";
import { registerMockExamTools } from "./src/tools/mock-exam.js";
import { registerAristotleTools } from "./src/tools/aristotle.js";
import { registerEnrollTools } from "./src/tools/enroll.js";
import { registerFlashcardTools } from "./src/tools/flashcards.js";
import { registerStudyPlanTools } from "./src/tools/study-plan.js";
import { registerAskTeacherTools } from "./src/tools/ask-teacher.js";
import { registerResources } from "./src/resources.js";
import { registerPrompts } from "./src/prompts.js";

/**
 * LMS MCP Server (mcp-use + MCP Apps)
 *
 * Course-management tools, resources, and prompts for the multi-tenant LMS,
 * exposed to AI agents. Authentication is Supabase OAuth 2.1; data access runs
 * as the authenticated user so Postgres RLS enforces tenant isolation. Four
 * read tools also render interactive React widgets (MCP Apps).
 */
const server = new MCPServer({
  name: "lms-mcp-server",
  title: "LMS Course Management",
  version: "2.0.0",
  description:
    "Manage courses, lessons, exercises, exams, and analytics for the LMS. Teachers and admins get management tools; students get self-scoped learning tools.",
  instructions:
    "Teachers/admins: use lms_list_courses to browse courses (renders a dashboard widget), lms_get_course for a course detail widget, lms_get_lesson to preview lesson content, and lms_list_exam_submissions to review student submissions. Students: use lms_my_learning for the learning dashboard, lms_view_lesson to read a lesson, lms_complete_lesson to mark it done, lms_my_exam_results for scores and feedback, lms_my_gamification for XP/achievements, and lms_browse_catalog to discover courses. All actions are scoped to the caller's tenant and enforced by row-level security.",
  baseUrl:
    process.env.MCP_SERVER_URL || process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
  // Supabase OAuth 2.1: clients authenticate against Supabase; we verify the
  // resulting JWTs. Tenant/role claims come from the LMS custom_access_token_hook.
  oauth: oauthSupabaseProvider({
    supabaseUrl: getSupabaseUrl(),
    verifyJwt: shouldVerifyJwt(),
  }),
});

// Per-tool guards: role-based call gating + audit logging to mcp_audit_log.
// Must run BEFORE registering tools — it monkey-patches server.tool to wrap
// every handler (the tool name isn't available in mcp-use 1.32.0 middleware).
installToolGuards(server);

// Role-based tool hiding for tools/list (call-time gating lives in the guards).
installToolPolicy(server);

// Host the OAuth consent UI Supabase redirects to.
installAuthRoutes(server);

// Register all MCP primitives.
registerCourseTools(server);
registerLessonTools(server);
registerExerciseTools(server);
registerExamTools(server);
registerAnalyticsTools(server);
registerStudentTools(server);
registerPracticeTools(server);
registerIngestTools(server);
registerMockExamTools(server);
registerAristotleTools(server);
registerEnrollTools(server);
registerFlashcardTools(server);
registerStudyPlanTools(server);
registerAskTeacherTools(server);
registerResources(server);
registerPrompts(server);

server.listen().then(() => {
  console.log("LMS MCP server running");
});
