import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Course ingest tools (Epic #348 Phase 2). Let the host LLM pull a whole
 * course's published curriculum into context, or search across everything
 * the caller is entitled to. Self-scoped: entitlements (not RLS-visible rows
 * alone) decide what's searchable, mirroring lms_browse_catalog's "access
 * source of truth" comment. Read-only, no widgets.
 *
 * Schema note: `exams` attach only to a course (no `lesson_id` column) — so
 * exam titles are returned as a course-level list, not nested per lesson.
 */

const MAX_SEARCH_HITS = 15;
const SNIPPET_RADIUS = 200;

/** Strip PostgREST or-filter metacharacters, same as getPublishedCourses. */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_\\,()]/g, "").trim();
}

/**
 * First field containing (case-insensitively) `term`, sliced to ±SNIPPET_RADIUS
 * chars around the match. Falls back to the start of the first non-empty
 * field if somehow no field matches (ilike matched a field we didn't scan).
 */
function makeSnippet(
  fields: Array<string | null | undefined>,
  term: string
): string {
  const lower = term.toLowerCase();
  for (const value of fields) {
    if (!value) continue;
    const idx = value.toLowerCase().indexOf(lower);
    if (idx === -1) continue;
    const start = Math.max(0, idx - SNIPPET_RADIUS);
    const end = Math.min(value.length, idx + term.length + SNIPPET_RADIUS);
    return `${start > 0 ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`;
  }
  const first = fields.find((v) => !!v);
  return first ? first.slice(0, SNIPPET_RADIUS) : "";
}

export function registerIngestTools(server: MCPServer) {
  // ── lms_get_course_content ──────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_course_content",
      description:
        "Ingest a course's full published curriculum for context: paginated lessons (title, summary, content) with their exercise titles, plus the course's exam titles. Requires enrollment/entitlement in the course. Use offset/limit to page through large courses.",
      schema: z.object({
        course_id: z.number().describe("The course ID to ingest content from"),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of lessons to skip for pagination"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Max lessons to return per page (1-10)"),
      }),
      annotations: {
        readOnlyHint: true,
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
        await session.verifyCourseAccess(input.course_id);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        const { data: course } = await supabase
          .from("courses")
          .select("title")
          .eq("course_id", input.course_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const { data: lessons, error: lessonsError, count } = await supabase
          .from("lessons")
          .select("id, sequence, title, summary, content", { count: "exact" })
          .eq("course_id", input.course_id)
          .eq("tenant_id", tenantId)
          .eq("status", "published")
          .order("sequence", { ascending: true })
          .range(input.offset, input.offset + input.limit - 1);
        if (lessonsError)
          return errorResult(`Loading lessons: ${lessonsError.message}`);

        const lessonIds = (lessons ?? []).map((l) => l.id as number);

        const [exercisesRes, examsRes] = await Promise.all([
          lessonIds.length > 0
            ? supabase
                .from("exercises")
                .select("id, lesson_id, title")
                .eq("course_id", input.course_id)
                .eq("tenant_id", tenantId)
                .eq("status", "published")
                .in("lesson_id", lessonIds)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("exams")
            .select("exam_id, title")
            .eq("course_id", input.course_id)
            .eq("tenant_id", tenantId)
            .eq("status", "published"),
        ]);
        if (exercisesRes.error)
          return errorResult(`Loading exercises: ${exercisesRes.error.message}`);
        if (examsRes.error)
          return errorResult(`Loading exams: ${examsRes.error.message}`);

        const exercisesByLesson = new Map<number, string[]>();
        for (const ex of exercisesRes.data ?? []) {
          const lid = ex.lesson_id as number | null;
          if (lid === null) continue;
          const titles = exercisesByLesson.get(lid) ?? [];
          titles.push(ex.title as string);
          exercisesByLesson.set(lid, titles);
        }

        const total = count ?? 0;
        const returnedCount = lessons?.length ?? 0;
        const hasMore = total > input.offset + returnedCount;

        const output = {
          course_id: input.course_id,
          course_title: course?.title ?? null,
          total,
          offset: input.offset,
          limit: input.limit,
          next_offset: hasMore ? input.offset + returnedCount : null,
          lessons: (lessons ?? []).map((l) => ({
            id: l.id,
            sequence: l.sequence,
            title: l.title,
            summary: l.summary,
            content: l.content,
            exercise_titles: exercisesByLesson.get(l.id as number) ?? [],
          })),
          // Exams attach only to the course (schema has no exams.lesson_id) —
          // returned as a course-level list, not nested per lesson.
          exams: (examsRes.data ?? []).map((e) => ({
            id: e.exam_id,
            title: e.title,
          })),
        };

        return ok(
          output,
          returnedCount === 0
            ? `No published lessons found for course ${input.course_id} at offset ${input.offset}.`
            : `Course "${course?.title ?? input.course_id}": lessons ${input.offset + 1}-${input.offset + returnedCount} of ${total}${hasMore ? ` (more at offset ${input.offset + returnedCount})` : ""}. ${output.exams.length} exam(s) in this course.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_search_content ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_search_content",
      description:
        "Search lesson and exercise titles/content across every course the caller is entitled to (or one course, if course_id is given). Returns up to 15 snippet hits. Use this to find where a topic is covered without ingesting whole courses.",
      schema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Search text to match against lesson and exercise content"),
        course_id: z
          .number()
          .optional()
          .describe(
            "Restrict the search to one course. Must be a course the caller is entitled to."
          ),
      }),
      annotations: {
        readOnlyHint: true,
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
        const term = sanitizeSearchTerm(input.query);
        if (!term) {
          return errorResult(
            "Search query is empty after removing unsupported characters."
          );
        }

        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const userId = session.getUserId();
        const nowIso = new Date().toISOString();

        // entitlements is the access source of truth (course-access.ts) —
        // same pattern as lms_browse_catalog.
        const { data: entitlements, error: entError } = await supabase
          .from("entitlements")
          .select("course_id, expires_at")
          .eq("user_id", userId)
          .eq("status", "active");
        if (entError)
          return errorResult(`Loading entitlements: ${entError.message}`);

        const entitledIds = new Set(
          (entitlements ?? [])
            .filter((e) => !e.expires_at || e.expires_at > nowIso)
            .map((e) => e.course_id as number)
        );

        let targetIds: number[];
        if (input.course_id !== undefined) {
          if (!entitledIds.has(input.course_id)) {
            return errorResult(
              `Access denied: you are not entitled to course ${input.course_id}.`
            );
          }
          targetIds = [input.course_id];
        } else {
          targetIds = Array.from(entitledIds);
        }

        if (targetIds.length === 0) {
          return ok(
            { query: term, total: 0, hits: [] },
            "You have no accessible courses to search."
          );
        }

        const [lessonsRes, exercisesRes] = await Promise.all([
          supabase
            .from("lessons")
            .select("id, course_id, title, summary, content")
            .eq("tenant_id", tenantId)
            .eq("status", "published")
            .in("course_id", targetIds)
            .or(
              `title.ilike.%${term}%,summary.ilike.%${term}%,content.ilike.%${term}%`
            )
            .limit(MAX_SEARCH_HITS),
          supabase
            .from("exercises")
            .select("id, course_id, lesson_id, title, instructions")
            .eq("tenant_id", tenantId)
            .eq("status", "published")
            .in("course_id", targetIds)
            .or(`title.ilike.%${term}%,instructions.ilike.%${term}%`)
            .limit(MAX_SEARCH_HITS),
        ]);
        if (lessonsRes.error)
          return errorResult(`Searching lessons: ${lessonsRes.error.message}`);
        if (exercisesRes.error)
          return errorResult(
            `Searching exercises: ${exercisesRes.error.message}`
          );

        const lessonHits = (lessonsRes.data ?? []).map((l) => ({
          type: "lesson" as const,
          id: l.id,
          course_id: l.course_id,
          title: l.title,
          snippet: makeSnippet([l.title, l.summary, l.content], term),
        }));
        const exerciseHits = (exercisesRes.data ?? []).map((e) => ({
          type: "exercise" as const,
          id: e.id,
          course_id: e.course_id,
          lesson_id: e.lesson_id,
          title: e.title,
          snippet: makeSnippet([e.title, e.instructions], term),
        }));

        const hits = [...lessonHits, ...exerciseHits].slice(0, MAX_SEARCH_HITS);

        return ok(
          { query: term, total: hits.length, hits },
          hits.length === 0
            ? `No matches for "${term}" in the ${targetIds.length} course(s) you have access to.`
            : `Found ${hits.length} match(es) for "${term}".`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
