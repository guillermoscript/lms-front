import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Aristotle shared tutor memory (Epic #348 Phase 2, issue #354).
 *
 * `aristotle_sessions` is the app's own session-summary table (populated
 * today by the in-app Aristotle chat via `/api/aristotle/sessions` and
 * rendered by `components/aristotle/session-list.tsx`). These tools let the
 * MCP-side tutor (prompts like `socratic-tutor`, `drill-coach`,
 * `exam-prep-session`) read that same history at the start of a session and
 * write a summary at the end, so memory is shared across both surfaces.
 *
 * Hard guardrails:
 * - `lms_get_tutor_history` returns summaries/topics only — never transcripts
 *   (`aristotle_messages` is never touched by either tool).
 * - `lms_record_tutor_session` writes exactly ONE `aristotle_sessions` row per
 *   call; it never writes `aristotle_messages`.
 * - `context_page` lives on `aristotle_messages`, not `aristotle_sessions` —
 *   there is nowhere to put `key_struggles` as a distinct column, so it is
 *   folded into the summary text.
 * - RLS on `aristotle_sessions` ("Users can manage their own sessions") only
 *   checks `user_id = auth.uid()` — it does NOT scope by tenant. Every query
 *   and insert here adds an explicit `tenant_id` filter/value to avoid
 *   cross-tenant leakage for users who belong to more than one tenant.
 */

const TOPIC_ARRAY = z
  .array(z.string().min(1))
  .describe("Short topic labels discussed this session, e.g. ['recursion', 'base cases']");

export function registerAristotleTools(server: MCPServer) {
  // ── lms_get_tutor_history ──────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_tutor_history",
      description:
        "Fetch the caller's recent Aristotle tutoring sessions for a course — summaries and topics discussed, NOT full transcripts. Call this at the start of a tutoring session to pick up where the student left off.",
      schema: z.object({
        course_id: z.number().describe("The course to fetch tutor history for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Max number of past sessions to return, most recent first"),
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

        const { data, error } = await session
          .getClient()
          .from("aristotle_sessions")
          .select("session_id, summary, topics_discussed, started_at, ended_at")
          .eq("course_id", input.course_id)
          .eq("user_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .order("started_at", { ascending: false })
          .limit(input.limit);
        if (error)
          return errorResult(`Loading tutor history: ${error.message}`);

        const sessions = (data ?? []).map((s) => ({
          session_id: s.session_id as string,
          summary: s.summary as string | null,
          topics_discussed: (s.topics_discussed as string[] | null) ?? [],
          started_at: s.started_at as string,
          ended_at: s.ended_at as string | null,
        }));

        return ok(
          { course_id: input.course_id, total: sessions.length, sessions },
          sessions.length === 0
            ? `No prior Aristotle tutoring sessions found for course ${input.course_id} — this is a fresh start.`
            : `${sessions.length} prior tutoring session(s) for course ${input.course_id}, most recent first. Latest: "${sessions[0].summary ?? "(no summary)"}"${sessions[0].topics_discussed.length > 0 ? ` — topics: ${sessions[0].topics_discussed.join(", ")}` : ""}.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_record_tutor_session ───────────────────────────────────────────────
  server.tool(
    {
      name: "lms_record_tutor_session",
      description:
        "Record a summary of the tutoring session just finished with the caller, for a course. Call this once at a natural end of a tutoring conversation (topic wrapped up, student leaving, etc.) so the next session — here or in the app — has memory of it. Writes ONE session summary row; never records message-level transcripts.",
      schema: z.object({
        course_id: z.number().describe("The course this tutoring session was about"),
        summary: z
          .string()
          .min(1)
          .describe("A concise summary of what was covered this session"),
        topics_discussed: TOPIC_ARRAY,
        key_struggles: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Specific things the student struggled with this session, if any — folded into the stored summary since there's no dedicated column for it"
          ),
        answer_seeking_count: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "How many times this session the student pressed for a direct answer instead of engaging with hints (\"just tell me\", etc.) — folded into the stored summary as an over-reliance signal for the teacher. Omit when zero."
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
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

        let summary =
          input.key_struggles && input.key_struggles.length > 0
            ? `${input.summary}\n\nKey struggles: ${input.key_struggles.join("; ")}`
            : input.summary;
        if (input.answer_seeking_count && input.answer_seeking_count > 0) {
          summary += `\n\n[over-reliance signal: student asked for direct answers ${input.answer_seeking_count} time(s) instead of working through hints]`;
        }
        const now = new Date().toISOString();

        const { data, error } = await session
          .getClient()
          .from("aristotle_sessions")
          .insert({
            course_id: input.course_id,
            user_id: session.getUserId(),
            tenant_id: session.getTenantId(),
            summary,
            topics_discussed: input.topics_discussed,
            started_at: now,
            ended_at: now,
          })
          .select("session_id, started_at, ended_at")
          .single();
        if (error)
          return errorResult(`Recording tutor session: ${error.message}`);

        return ok(
          {
            session_id: data.session_id,
            course_id: input.course_id,
            summary,
            topics_discussed: input.topics_discussed,
            started_at: data.started_at,
            ended_at: data.ended_at,
          },
          `Tutoring session recorded for course ${input.course_id} (${input.topics_discussed.length} topic(s)).`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
