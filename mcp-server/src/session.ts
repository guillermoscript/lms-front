import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestContext } from "mcp-use/server";
import { createUserClient } from "./supabase.js";

/**
 * Minimal shape of the auth context mcp-use injects into tool/resource/prompt
 * handlers when `oauth` is configured. We only read what we need.
 */
export interface McpAuth {
  user: { userId: string; email?: string; name?: string };
  accessToken: string;
  payload: Record<string, unknown>;
}

export interface McpHandlerContext {
  auth?: McpAuth;
  /**
   * mcp-use passes resource/template handlers the raw request-context store
   * (AsyncLocalStorage) instead of an object with an `.auth` property — the
   * auth lives at `ctx.get("auth")`. Tool handlers get `.auth` directly.
   */
  get?: (key: string) => unknown;
}

/**
 * Resolve the auth payload regardless of handler-context shape.
 *
 * mcp-use 1.32.0 hands tool handlers a ctx with `.auth`, but resource/template
 * handlers receive the parsed URI params as their 3rd arg (no auth at all).
 * For those, fall back to the request-scoped AsyncLocalStorage context, which
 * `runWithContext` populates for the entire dispatch (tools AND resources).
 */
function resolveAuth(ctx: McpHandlerContext): McpAuth | undefined {
  if (ctx.auth) return ctx.auth;
  if (typeof ctx.get === "function") {
    const fromCtx = ctx.get("auth") as McpAuth | undefined;
    if (fromCtx) return fromCtx;
  }
  const reqCtx = getRequestContext() as { get?: (k: string) => unknown } | undefined;
  if (reqCtx && typeof reqCtx.get === "function") {
    return reqCtx.get("auth") as McpAuth | undefined;
  }
  return undefined;
}

const ALLOWED_ROLES = ["student", "teacher", "admin"];

/**
 * Per-request session for the LMS MCP server.
 *
 * Wraps the authenticated caller's identity, tenant context (from JWT claims
 * injected by the LMS `custom_access_token_hook`), and an RLS-aware Supabase
 * client. Exposes the same surface the previous `AuthManager` did, so tool
 * handlers read almost identically — but data access is now gated by RLS.
 */
export class LmsSession {
  private constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly tenantId: string,
    private readonly tenantRole: string
  ) {}

  /**
   * Build a session from a handler context. Throws if the caller is
   * unauthenticated or has no recognized tenant role (student/teacher/admin).
   * Which tools a role may call is enforced by the tool policy + per-tool
   * guards, not here. Callers should wrap in try/catch and return `errorResult`.
   */
  static fromContext(ctx: McpHandlerContext): LmsSession {
    const auth = resolveAuth(ctx);
    if (!auth?.user?.userId || !auth.accessToken) {
      throw new Error("Authentication required.");
    }

    const payload = auth.payload ?? {};
    const tenantId =
      (payload.tenant_id as string | undefined) ??
      (payload.app_metadata as { tenant_id?: string } | undefined)?.tenant_id;
    const tenantRole =
      (payload.tenant_role as string | undefined) ??
      (payload.user_role as string | undefined) ??
      "student";

    if (!tenantId) {
      throw new Error(
        "Tenant context missing from token. The access token must include a 'tenant_id' claim."
      );
    }

    if (!ALLOWED_ROLES.includes(tenantRole)) {
      throw new Error(
        `Access denied: role '${tenantRole}'. Only students, teachers, and admins can use the LMS MCP server.`
      );
    }

    return new LmsSession(
      createUserClient(auth.accessToken),
      auth.user.userId,
      tenantId,
      tenantRole
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getUserId(): string {
    return this.userId;
  }

  getRole(): string {
    return this.tenantRole;
  }

  isAdmin(): boolean {
    return this.tenantRole === "admin";
  }

  getTenantId(): string {
    return this.tenantId;
  }

  // --- Student access guard --------------------------------------------------

  /**
   * Verify the caller may access a course as a learner, via the same
   * `has_course_access` SECURITY DEFINER RPC the app uses (entitlements-aware).
   * Teachers/admins short-circuit through course visibility instead: if RLS
   * lets them read the course, they may view it.
   */
  async verifyCourseAccess(courseId: number): Promise<void> {
    if (this.tenantRole !== "student") {
      const { data, error } = await this.client
        .from("courses")
        .select("course_id")
        .eq("course_id", courseId)
        .eq("tenant_id", this.tenantId)
        .maybeSingle();
      if (error || !data) throw new Error(`Course ${courseId} not found`);
      return;
    }
    const { data, error } = await this.client.rpc("has_course_access", {
      _user_id: this.userId,
      _course_id: courseId,
    });
    if (error) throw new Error(`Checking course access: ${error.message}`);
    if (data !== true) {
      throw new Error(
        `Access denied: you are not enrolled in course ${courseId}. Browse the catalog with lms_browse_catalog.`
      );
    }
  }

  // --- Ownership guards (defense in depth on top of RLS) -------------------

  async verifyCourseOwnership(courseId: number): Promise<void> {
    const { data, error } = await this.client
      .from("courses")
      .select("author_id, tenant_id")
      .eq("course_id", courseId)
      .single();

    if (error || !data) throw new Error(`Course ${courseId} not found`);
    if (data.tenant_id !== this.tenantId) {
      throw new Error(
        `Access denied: course ${courseId} belongs to a different tenant`
      );
    }
    if (this.isAdmin()) return;
    if (data.author_id !== this.userId) {
      throw new Error(`Access denied: you don't own course ${courseId}`);
    }
  }

  async verifyLessonOwnership(lessonId: number): Promise<number> {
    const { data, error } = await this.client
      .from("lessons")
      .select("course_id")
      .eq("id", lessonId)
      .single();
    if (error || !data) throw new Error(`Lesson ${lessonId} not found`);
    await this.verifyCourseOwnership(data.course_id);
    return data.course_id;
  }

  async verifyExamOwnership(examId: number): Promise<number> {
    const { data, error } = await this.client
      .from("exams")
      .select("course_id")
      .eq("exam_id", examId)
      .single();
    if (error || !data) throw new Error(`Exam ${examId} not found`);
    await this.verifyCourseOwnership(data.course_id);
    return data.course_id;
  }

  async verifyExerciseOwnership(exerciseId: number): Promise<number> {
    const { data, error } = await this.client
      .from("exercises")
      .select("course_id")
      .eq("id", exerciseId)
      .single();
    if (error || !data) throw new Error(`Exercise ${exerciseId} not found`);
    await this.verifyCourseOwnership(data.course_id!);
    return data.course_id!;
  }

  async verifyQuestionOwnership(questionId: number): Promise<number> {
    const { data, error } = await this.client
      .from("exam_questions")
      .select("exam_id")
      .eq("question_id", questionId)
      .single();
    if (error || !data) throw new Error(`Question ${questionId} not found`);
    return await this.verifyExamOwnership(data.exam_id);
  }
}
