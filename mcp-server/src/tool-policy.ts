import type { MCPServer, MiddlewareContext, McpMiddlewareFn } from "mcp-use/server";

/**
 * Role-based tool access (Option A).
 *
 *   admin   → every tool.
 *   teacher → create/edit/browse own content + analytics for THEIR OWN courses
 *             (RLS + ownership checks already scope analytics to owned courses),
 *             BUT NOT destructive ops (delete/archive).
 *   student → only the self-scoped `lms_my_*` / learning tools below; every
 *             query runs against their own data (RLS + explicit user filters).
 *   other   → no tools.
 *
 * Deletes are matched by prefix so future `lms_delete_*` tools are covered
 * automatically.
 *
 * ── mcp-use 1.32.0 middleware reality ──────────────────────────────────────
 * Two facts about this version shape how the policy is enforced:
 *   1. `mcp:tools/list` middleware receives the bare tools **array** as the
 *      result of `next()` (mcp-use unwraps `result.tools` before calling the
 *      chain and re-wraps an array return). So the list filter must operate on
 *      an array, not `{ tools: [...] }`.
 *   2. `mcp:tools/call` middleware ctx exposes only the tool *arguments* as
 *      `ctx.params` — the tool **name is not present**. Name-based call gating
 *      therefore cannot live in middleware; it runs in the per-tool wrapper
 *      (`register.ts`), which is given the registered name. This module only
 *      hides disallowed tools from `tools/list`.
 */
const TEACHER_DENY_PREFIXES = ["lms_delete_"];

/**
 * Student-usable tools. All are self-scoped: they read (or, for
 * lms_complete_lesson, write) only the caller's own rows, with RLS plus
 * explicit user-id filters. Teachers and admins may call them too — "my"
 * simply resolves to the caller.
 */
const STUDENT_TOOLS = new Set<string>([
  "lms_my_learning",
  "lms_view_lesson",
  "lms_complete_lesson",
  "lms_my_exam_results",
  "lms_my_gamification",
  "lms_browse_catalog",
  // AI-tutor practice tools (Epic #348) — all self-scoped.
  "lms_get_exercise_for_student",
  "lms_complete_exercise",
  "lms_practice_quiz",
  "lms_record_practice_attempt",
  "lms_get_my_weak_spots",
  "lms_get_tutor_config",
  // #396 — Elo adaptive practice item selection.
  "lms_get_adaptive_practice_items",
  // Phase 2 (Epic #348) — ingest, mock exams, shared tutor memory, self-enroll.
  "lms_get_course_content",
  "lms_search_content",
  "lms_get_mock_exam_source",
  "lms_get_tutor_history",
  "lms_record_tutor_session",
  "lms_enroll_in_course",
  // Phase 3 (Epic #348) — exam readiness heatmap.
  "lms_get_exam_readiness",
  // Phase 4 (Epic #348) — flashcards (FSRS since #389), weekly study plan, teacher escalation.
  "lms_create_review_cards",
  "lms_get_due_reviews",
  "lms_grade_review",
  "lms_set_study_plan",
  "lms_get_study_plan",
  "lms_complete_study_goal",
  "lms_ask_teacher",
]);

const TEACHER_DENY_TOOLS = new Set<string>([
  // Destructive — admin only. Analytics tools stay allowed for teachers because
  // they are ownership-scoped (a teacher only ever sees their own courses' data).
  "lms_archive_course",
  // School-wide cross-course aggregate — admin only. A teacher would see only a
  // partial "school" (their own courses via RLS), which is misleading; the
  // per-course tools (lms_get_course_stats, lms_get_student_progress) cover them.
  "lms_get_school_stats",
  // Landing pages are school-level marketing — admin only (the landing_pages RLS
  // policy also only grants tenant admins, so hiding these from teachers just
  // avoids guaranteed permission errors). lms_delete_landing_page is already
  // covered by the lms_delete_ prefix.
  "lms_get_landing_blocks",
  "lms_list_landing_pages",
  "lms_get_landing_page",
  "lms_create_landing_page",
  "lms_update_landing_page",
  "lms_publish_landing_page",
  "lms_unpublish_landing_page",
]);

export function isToolAllowedForRole(
  role: string | undefined,
  toolName: string
): boolean {
  if (role === "admin") return true;
  if (role === "student") return STUDENT_TOOLS.has(toolName);
  if (role !== "teacher") return false;
  if (TEACHER_DENY_PREFIXES.some((p) => toolName.startsWith(p))) return false;
  return !TEACHER_DENY_TOOLS.has(toolName);
}

/** Read the caller's tenant role from the verified JWT claims. */
export function roleOf(ctx: MiddlewareContext | { auth?: unknown }): string | undefined {
  const payload = (ctx.auth as { payload?: Record<string, unknown> } | undefined)
    ?.payload;
  return (
    (payload?.tenant_role as string | undefined) ??
    (payload?.user_role as string | undefined)
  );
}

/**
 * Install `tools/list` gating: hide tools the caller's role may not use.
 *
 * Call-time enforcement (rejecting a disallowed `tools/call`) lives in the
 * per-tool wrapper, see `installToolGuards` in `register.ts` — hiding is not
 * security on its own.
 */
export function installToolPolicy(server: MCPServer): void {
  const use = (
    server as unknown as {
      use: (pattern: string, handler: McpMiddlewareFn) => void;
    }
  ).use.bind(server);

  use("mcp:tools/list", async (ctx, next) => {
    const role = roleOf(ctx);
    const result = await next();

    // mcp-use 1.32.0 hands the chain the bare tools array; older/other shapes
    // may hand `{ tools: [...] }`. Handle both so the filter never silently
    // no-ops if the framework changes the contract.
    if (Array.isArray(result)) {
      return (result as Array<{ name: string }>).filter((t) =>
        isToolAllowedForRole(role, t.name)
      );
    }
    const obj = result as { tools?: Array<{ name: string }> } | null;
    if (obj?.tools) {
      obj.tools = obj.tools.filter((t) => isToolAllowedForRole(role, t.name));
    }
    return obj;
  });
}
