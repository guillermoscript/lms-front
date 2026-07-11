import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * lms_ask_teacher (Epic #348 Phase 4, issue #361): consented escalation from
 * the AI tutor to the human teacher. Students cannot INSERT into
 * notifications/user_notifications under RLS, so the write goes through the
 * narrow SECURITY DEFINER RPC create_student_question_notification, which
 * re-validates enrollment (has_course_access) and rate-limits to 3 questions
 * per student per course per day. The tool result echoes exactly what was
 * sent — full transparency to the student.
 */

export function registerAskTeacherTools(server: MCPServer) {
  server.tool(
    {
      name: "lms_ask_teacher",
      description:
        "Send the caller's question about a course to the course's human teacher (shows up in the teacher's in-app notifications). CONSENT REQUIRED: only call this after the student has explicitly agreed to contact the teacher, and never include conversation transcripts they haven't approved. Use when the student is genuinely stuck despite re-teaching. Limited to 3 questions per course per day.",
      schema: z.object({
        course_id: z.number().describe("The course the question is about"),
        question: z
          .string()
          .min(10)
          .max(1000)
          .describe("The student's question, in their own words (10-1000 chars)"),
        context: z
          .string()
          .max(1000)
          .optional()
          .describe(
            "Optional tutor context the student approved sharing, e.g. \"missed 'recursion base case' 3 times in practice\""
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
        const supabase = session.getClient();

        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("course_id, title, author_id")
          .eq("course_id", input.course_id)
          .eq("tenant_id", session.getTenantId())
          .maybeSingle();
        if (courseError)
          return errorResult(`Loading course: ${courseError.message}`);
        if (!course) return errorResult(`Course ${input.course_id} not found`);
        if (!course.author_id)
          return errorResult(
            `Course ${input.course_id} has no teacher to notify`
          );

        const { data: teacher } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", course.author_id)
          .maybeSingle();

        // The RPC re-validates enrollment and enforces the 3/day/course rate
        // limit server-side (SECURITY DEFINER — the only path that can write
        // a notification targeted at another user).
        const { data: notificationId, error: rpcError } = await supabase.rpc(
          "create_student_question_notification",
          {
            _course_id: input.course_id,
            _message: input.question,
            _context: input.context ?? null,
          }
        );
        if (rpcError) return errorResult(rpcError.message);

        const teacherName = (teacher?.full_name as string | null) ?? "the teacher";
        return ok(
          {
            notification_id: notificationId,
            course_id: course.course_id,
            course_title: course.title,
            teacher_name: teacherName,
            sent_question: input.question,
            sent_context: input.context ?? null,
          },
          `Sent to ${teacherName} (course "${course.title}"):\n\nQuestion: ${input.question}${
            input.context ? `\nShared context: ${input.context}` : ""
          }\n\nThey'll see it in their notifications. Nothing else from this conversation was shared.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
