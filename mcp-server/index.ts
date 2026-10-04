import { MCPServer, type ServerConfig } from "mcp-use";
import { oauthSupabaseProvider, type SupabaseOAuthUser } from "mcp-use/oauth/supabase";
import { getSupabaseUrl, getSupabaseJwtSecret, demoWidgetsEnabled } from "./src/env.js";
import type { LmsServer } from "./src/server-types.js";
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
import { registerLandingPageTools } from "./src/tools/landing-pages.js";
import { registerCertificateTools } from "./src/tools/certificates.js";
import { registerDemoTools } from "./src/tools/demo.js";
import { registerResources } from "./src/resources.js";
import { registerPrompts } from "./src/prompts.js";

/**
 * LMS MCP Server (mcp-use v2 + MCP Apps)
 *
 * Course-management tools, resources, prompts, and Agent Skills for the
 * multi-tenant LMS, exposed to AI agents. Authentication is Supabase OAuth 2.1;
 * data access runs as the authenticated user so Postgres RLS enforces tenant
 * isolation. View-bound tools render interactive React views (MCP Apps) from
 * `views/`, and the conventional `skills/` directory is served over the
 * Skills over MCP extension (skills/list, skills/get).
 *
 * The externally visible origin comes from the `MCP_URL` environment variable
 * (set in production, where the Next.js app fronts this server at /api/mcp);
 * unset, mcp-use derives it from the local listener.
 */
const baseConfig = {
  name: "lms-mcp-server",
  title: "LMS Course Management",
  version: "2.0.0",
  description:
    "Manage courses, lessons, exercises, exams, and analytics for the LMS. Teachers and admins get management tools; students get self-scoped learning tools.",
  instructions:
    "Teachers/admins: use lms_list_courses to browse courses (renders a dashboard widget), lms_get_course for a course detail widget, lms_get_lesson to preview lesson content, and lms_list_exam_submissions to review student submissions. Admins can also draft school landing pages: lms_get_landing_blocks for the block vocabulary, then lms_create_landing_page (draft) and lms_publish_landing_page. Students: use lms_my_learning for the learning dashboard, lms_view_lesson to read a lesson, lms_complete_lesson to mark it done, lms_my_exam_results for scores and feedback, lms_my_gamification for XP/achievements, and lms_browse_catalog to discover courses. Certificates: students use lms_my_certificates and lms_get_certificate_eligibility; teachers/admins use lms_list_course_certificates for a course's roster (it can issue) plus lms_get_certificate_template / lms_set_certificate_template — a course with no active template issues no certificates at all, which is the usual reason none appear. All actions are scoped to the caller's tenant and enforced by row-level security.",
  // Serve the conventional `skills/` directory over the Skills over MCP
  // extension (skills/list, skills/get). `true` makes the directory a hard
  // requirement rather than best-effort discovery.
  skills: true,
  favicon: "favicon.ico",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml" as const,
      sizes: ["512x512"],
    },
  ],
} satisfies Omit<ServerConfig, "oauth">;

// Supabase OAuth 2.1: clients authenticate against Supabase; we verify the
// resulting JWTs (project JWKS for ES256 keys, or the legacy HS256 secret via
// MCP_USE_OAUTH_SUPABASE_JWT_SECRET / SUPABASE_JWT_SECRET — required for local
// Supabase and any project still on the legacy signing secret). Tenant/role
// claims come from the LMS custom_access_token_hook.
//
// Widget-preview mode (MCP_DEMO_WIDGETS=1, dev only) drops OAuth entirely:
// bearer auth on /mcp would otherwise 401 the inspector before any handler
// runs, and the whole point of the mode is rendering widgets with no Supabase
// and no login. With no auth there is no tenant role, so `tools/list` exposes
// only the `lms_demo_*` fixtures — every real tool still refuses to run
// ("Authentication required" from LmsSession) because it has no session.
const server: LmsServer = demoWidgetsEnabled()
  ? (new MCPServer(baseConfig) as unknown as LmsServer)
  : new MCPServer<SupabaseOAuthUser>({
      ...baseConfig,
      oauth: oauthSupabaseProvider({
        supabaseUrl: getSupabaseUrl(),
        jwtSecret: getSupabaseJwtSecret(),
      }),
    });

// Call-time gating + branding + audit logging (`mcp:tools/call` middleware).
installToolGuards(server);

// Role-based tool hiding for tools/list (call-time gating lives in the guards).
installToolPolicy(server);

if (demoWidgetsEnabled()) {
  // Dev-only widget previews (MCP_DEMO_WIDGETS=1, never in production). These
  // handlers serve static fixtures and never touch a session or Supabase; the
  // call guard lets `lms_demo_*` through role-less only while the flag is set.
  //
  // The demo tools REPLACE the real inventory in this mode: v2 allows at most
  // one tool per view, and the real tools bind the same views the fixtures
  // render. Nothing is lost — a role-less caller could never list or call a
  // real tool anyway, and there is no OAuth (so no consent UI) to host.
  registerDemoTools(server);
} else {
  // Host the OAuth consent UI Supabase redirects to (needs Supabase env).
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
  registerLandingPageTools(server);
  registerCertificateTools(server);
}

registerResources(server);
registerPrompts(server);

// `mcp-use dev`/`start` import this module and own the listener.
export default server;
