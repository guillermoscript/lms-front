import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Weekly study plan + goals (Epic #348 Phase 4, issue #359). A Duolingo-style
 * plan the student and tutor maintain together: goals live in `study_goals`
 * (RLS own-rows), one row per goal, a week keyed by its Monday. The get tool
 * also returns real progress context (next lesson per enrolled course, due
 * flashcard count) so the tutor plans from data, not guesses.
 */

const GOAL_KINDS = ["lesson", "practice", "review", "exam_prep", "custom"] as const;

/** Normalize a date (or today) to the Monday of its week, as YYYY-MM-DD (UTC). */
function mondayOf(dateStr?: string): string {
  const d = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid week_start date: ${dateStr}`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

type GoalRow = {
  id: number;
  title: string;
  kind: string;
  course_id: number | null;
  target_ref: Record<string, unknown> | null;
  required: boolean;
  done: boolean;
  done_at: string | null;
};

/** Retrieval-practice goals are required by default (learning-science finding
 *  #6: assigned practice beats optional); the caller can override per goal. */
function isRequiredByDefault(kind: (typeof GOAL_KINDS)[number]): boolean {
  return kind === "practice" || kind === "review";
}

async function loadWeekGoals(session: LmsSession, weekStart: string) {
  const { data, error } = await session
    .getClient()
    .from("study_goals")
    .select("id, title, kind, course_id, target_ref, required, done, done_at")
    .eq("user_id", session.getUserId())
    .eq("tenant_id", session.getTenantId())
    .eq("week_start", weekStart)
    .order("id", { ascending: true });
  if (error) throw new Error(`Loading study goals: ${error.message}`);
  return (data ?? []) as GoalRow[];
}

/** Real progress context: next published-but-uncompleted lesson per enrolled
 *  course (same logic as lms_my_learning) + count of due flashcards. */
async function loadPlanContext(session: LmsSession) {
  const supabase = session.getClient();
  const userId = session.getUserId();

  const [enrollRes, dueRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "course:courses(course_id, title, lessons(id, title, sequence, status, lesson_completions(user_id)))"
      )
      .eq("user_id", userId)
      .eq("tenant_id", session.getTenantId())
      .eq("status", "active")
      .eq("course.lessons.lesson_completions.user_id", userId)
      .limit(20),
    supabase
      .from("review_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("tenant_id", session.getTenantId())
      .eq("suspended", false)
      .lte("due_at", new Date().toISOString()),
  ]);
  if (enrollRes.error)
    throw new Error(`Loading enrollments: ${enrollRes.error.message}`);
  if (dueRes.error)
    throw new Error(`Counting due reviews: ${dueRes.error.message}`);

  const nextLessons = (enrollRes.data ?? [])
    .map((row) => {
      const course = row.course as unknown as {
        course_id: number;
        title: string;
        lessons: Array<{
          id: number;
          title: string;
          sequence: number;
          status: string;
          lesson_completions: Array<{ user_id: string }>;
        }>;
      } | null;
      if (!course) return null;
      const next = (course.lessons ?? [])
        .filter((l) => l.status === "published")
        .sort((a, b) => a.sequence - b.sequence)
        .find((l) => (l.lesson_completions ?? []).length === 0);
      if (!next) return null;
      return {
        course_id: course.course_id,
        course_title: course.title,
        lesson_id: next.id,
        lesson_title: next.title,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return { next_lessons: nextLessons, due_reviews: dueRes.count ?? 0 };
}

export function registerStudyPlanTools(server: MCPServer) {
  // ── lms_set_study_plan ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_set_study_plan",
      description:
        "Replace the caller's study goals for a week (defaults to the current week). Sets the WHOLE week's plan in one call — existing goals for that week are removed first, so include every goal the plan should contain. Derive goals from real data (lms_get_study_plan context, lms_get_my_weak_spots, lms_get_exam_readiness), and agree on the plan with the student before saving. Retrieval-practice goals (kind 'practice' or 'review') are REQUIRED by default — completing the week depends on them; only mark one optional (required: false) when the student's teacher or plan explicitly relaxes it.",
      schema: z.object({
        week_start: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "Week to plan, YYYY-MM-DD. Any day works — it is normalized to that week's Monday. Defaults to the current week."
          ),
        goals: z
          .array(
            z.object({
              title: z.string().min(1).max(200).describe("Goal as shown to the student, e.g. \"Finish 'Recursion basics' lesson\""),
              kind: z
                .enum(GOAL_KINDS)
                .describe("Goal type: lesson | practice | review | exam_prep | custom"),
              course_id: z.number().optional().describe("Course this goal belongs to, if any"),
              target_ref: z
                .record(z.string(), z.unknown())
                .optional()
                .describe("Machine-readable target, e.g. {\"lesson_id\": 42} or {\"topic\": \"recursion\"}"),
              required: z
                .boolean()
                .optional()
                .describe(
                  "Whether the goal is required for week completion. Defaults to true for kind 'practice' and 'review' (retrieval practice is mandatory by default), false for other kinds. Set false only to explicitly relax a practice/review goal."
                ),
            })
          )
          .min(1)
          .max(14)
          .describe("The week's goals (1-14)"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const weekStart = mondayOf(input.week_start);
        const supabase = session.getClient();

        // Replace semantics: clear the caller's week, then insert the new set.
        const { error: deleteError } = await supabase
          .from("study_goals")
          .delete()
          .eq("user_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .eq("week_start", weekStart);
        if (deleteError)
          return errorResult(`Clearing previous plan: ${deleteError.message}`);

        const rows = input.goals.map((g) => ({
          user_id: session.getUserId(),
          tenant_id: session.getTenantId(),
          course_id: g.course_id ?? null,
          title: g.title,
          kind: g.kind,
          target_ref: g.target_ref ?? null,
          required: g.required ?? isRequiredByDefault(g.kind),
          week_start: weekStart,
        }));
        const { data, error } = await supabase
          .from("study_goals")
          .insert(rows)
          .select("id, title, kind, required");
        if (error) return errorResult(`Saving plan: ${error.message}`);

        const requiredCount = (data ?? []).filter((g) => g.required).length;
        return ok(
          { week_start: weekStart, goals: data ?? [] },
          `Saved ${data?.length ?? 0} goal(s) for the week of ${weekStart} (${requiredCount} required). Show it with lms_get_study_plan.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_study_plan ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_study_plan",
      description:
        "Show the caller's study plan for a week (defaults to the current week) in the study-plan widget, plus planning context computed from real data: the next lesson due in each enrolled course and how many flashcards are due. Use the context to propose or update goals.",
      schema: z.object({
        week_start: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Week to show, YYYY-MM-DD (normalized to Monday). Defaults to the current week."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "study-plan",
        invoking: "Loading your study plan...",
        invoked: "Study plan ready",
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const weekStart = mondayOf(input.week_start);
        const [goals, context] = await Promise.all([
          loadWeekGoals(session, weekStart),
          loadPlanContext(session),
        ]);

        const doneCount = goals.filter((g) => g.done).length;
        const progress =
          goals.length > 0 ? Math.round((doneCount / goals.length) * 100) : 0;
        const requiredGoals = goals.filter((g) => g.required);
        const requiredLeft = requiredGoals.filter((g) => !g.done).length;

        return widget({
          props: {
            week_start: weekStart,
            goals: goals.map((g) => ({
              id: g.id,
              title: g.title,
              kind: g.kind,
              course_id: g.course_id,
              required: g.required,
              done: g.done,
              done_at: g.done_at,
            })),
            progress,
            context,
          },
          output: text(
            goals.length === 0
              ? `No plan yet for the week of ${weekStart}. Context: ${context.next_lessons.length} course(s) with a next lesson, ${context.due_reviews} flashcard(s) due. Propose goals and save them with lms_set_study_plan. Remember: practice/review goals are required by default.`
              : `Week of ${weekStart}: ${doneCount}/${goals.length} goals done (${progress}%). ${
                  requiredGoals.length > 0
                    ? requiredLeft === 0
                      ? "All required goals done. "
                      : `${requiredLeft} REQUIRED goal(s) still open — the week isn't complete until they're done. `
                    : ""
                }${context.due_reviews} flashcard(s) due.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_complete_study_goal ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_complete_study_goal",
      description:
        "Mark one of the caller's study goals as done. Idempotent — completing an already-done goal keeps its original completion time.",
      schema: z.object({
        goal_id: z.number().describe("The study goal ID to mark done"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();
        const { data: goal, error } = await supabase
          .from("study_goals")
          .select("id, title, done, done_at")
          .eq("id", input.goal_id)
          .eq("user_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();
        if (error) return errorResult(`Loading goal: ${error.message}`);
        if (!goal) return errorResult(`Goal ${input.goal_id} not found`);

        if (goal.done) {
          return ok(
            { goal_id: goal.id, done: true, done_at: goal.done_at },
            `"${goal.title}" was already done.`
          );
        }

        const doneAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("study_goals")
          .update({ done: true, done_at: doneAt })
          .eq("id", input.goal_id)
          .eq("user_id", session.getUserId());
        if (updateError)
          return errorResult(`Completing goal: ${updateError.message}`);

        return ok(
          { goal_id: goal.id, done: true, done_at: doneAt },
          `Done: "${goal.title}" ✔`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
