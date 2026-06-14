import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, okText, errorResult, ResponseFormat, PaginationSchema } from "../format.js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve student display names by user id.
 *
 * `enrollments.user_id` and `exam_submissions.student_id` FK to `auth.users`,
 * NOT `profiles` — so PostgREST cannot embed `profiles` via those columns
 * (it errors: "Could not find a relationship ... in the schema cache").
 * `profiles.id` mirrors the auth user id 1:1, so we resolve names in a second,
 * RLS-scoped query instead of an embed.
 */
async function fetchProfileNames(
  supabase: SupabaseClient,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  for (const p of (data as { id: string; full_name: string | null }[] | null) ?? []) {
    if (p.full_name) names.set(p.id, p.full_name);
  }
  return names;
}

export function registerAnalyticsTools(server: MCPServer) {
  // ── lms_list_enrollments ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_enrollments",
      description: "List students enrolled in a course with their enrollment status and dates.",
      schema: z.object({
        ...PaginationSchema,
        course_id: z.number().describe("The course ID"),
        status: z
          .enum(["active", "disabled"])
          .optional()
          .describe("Filter by enrollment status"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id, status, limit, offset, response_format }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        await session.verifyCourseOwnership(course_id);
        const supabase = session.getClient();

        let query = supabase
          .from("enrollments")
          .select(`enrollment_id, status, enrollment_date, user_id`, {
            count: "exact",
          })
          .eq("course_id", course_id)
          .order("enrollment_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing enrollments: ${error.message}`);
        if (!data || data.length === 0) {
          return okText("No enrollments found.");
        }

        const names = await fetchProfileNames(
          supabase,
          data.map((e) => e.user_id)
        );

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset:
            total > offset + data.length ? offset + data.length : undefined,
          enrollments: data.map((e) => ({
            id: e.enrollment_id,
            status: e.status,
            date: e.enrollment_date,
            student_id: e.user_id,
            student_name: names.get(e.user_id) ?? null,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Enrollments for course ${course_id}`,
            `Showing ${data.length} of ${total} students`,
            "",
          ];
          for (const e of output.enrollments) {
            const name = e.student_name ?? e.student_id;
            lines.push(`- **${name}** [${e.status}] — enrolled ${e.date}`);
          }
          textContent = lines.join("\n");
        }

        return ok(output as unknown as Record<string, unknown>, textContent);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_list_exam_submissions (widget tool) ───────────────────────────────
  server.tool(
    {
      name: "lms_list_exam_submissions",
      description: "List all submissions for an exam with scores and review status.",
      schema: z.object({
        limit: PaginationSchema.limit,
        offset: PaginationSchema.offset,
        exam_id: z.number().describe("The exam ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      widget: {
        name: "exam-submissions",
        invoking: "Loading submissions...",
        invoked: "Submissions loaded",
      },
    },
    async ({ exam_id, limit, offset }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        await session.verifyExamOwnership(exam_id);
        const supabase = session.getClient();

        const { data, error, count } = await supabase
          .from("exam_submissions")
          .select(
            `submission_id, score, submission_date, review_status, student_id`,
            { count: "exact" }
          )
          .eq("exam_id", exam_id)
          .order("submission_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return errorResult(`Listing submissions: ${error.message}`);
        if (!data || data.length === 0) {
          return widget({
            props: { exam_id, total: 0, submissions: [] },
            output: text("No submissions found for this exam."),
          });
        }

        const names = await fetchProfileNames(
          supabase,
          data.map((s) => s.student_id)
        );

        const total = count || 0;
        const submissions = data.map((s) => ({
          id: s.submission_id as number,
          student_name: names.get(s.student_id) ?? null,
          score: s.score as number | null,
          submission_date: s.submission_date as string,
          review_status: s.review_status as string | null,
        }));

        return widget({
          props: { exam_id, total, submissions },
          output: text(`${total} submission(s).`),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_submission_details ────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_submission_details",
      description:
        "Get full details for a specific exam submission, including AI grading data and feedback.",
      schema: z.object({
        submission_id: z.number().describe("The submission ID"),
        response_format: PaginationSchema.response_format,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ submission_id, response_format }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        const supabase = session.getClient();

        const { data, error } = await supabase
          .from("exam_submissions")
          .select(
            `submission_id, score, submission_date, review_status, feedback, ai_data, student_id, exam_id`
          )
          .eq("submission_id", submission_id)
          .single();

        if (error || !data) return errorResult(`Submission ${submission_id} not found.`);

        await session.verifyExamOwnership(data.exam_id);

        const names = await fetchProfileNames(supabase, [data.student_id]);
        const output = {
          submission: {
            id: data.submission_id,
            exam_id: data.exam_id,
            student_id: data.student_id,
            student_name: names.get(data.student_id) ?? null,
            score: data.score,
            status: data.review_status,
            date: data.submission_date,
            feedback: data.feedback,
            ai_data: data.ai_data,
          },
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const name = output.submission.student_name ?? output.submission.student_id;
          let result = `# Submission ${data.submission_id}\n\n`;
          result += `**Student:** ${name}\n`;
          result += `**Exam ID:** ${data.exam_id}\n`;
          result += `**Score:** ${data.score ?? "pending"}\n`;
          result += `**Review Status:** ${data.review_status ?? "pending"}\n`;
          result += `**Submitted:** ${data.submission_date}\n\n`;

          if (data.ai_data) {
            result += `## AI Data\n\n\`\`\`json\n${JSON.stringify(data.ai_data, null, 2)}\n\`\`\`\n\n`;
          }

          if (data.feedback) {
            result += `## Feedback\n\n${
              typeof data.feedback === "string"
                ? data.feedback
                : JSON.stringify(data.feedback, null, 2)
            }`;
          }
          textContent = result;
        }

        return ok(output as unknown as Record<string, unknown>, textContent);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_course_stats ──────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_course_stats",
      description:
        "Get aggregate statistics for a course: enrollment, completion, and exam performance.",
      schema: z.object({
        course_id: z.number().describe("The course ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        await session.verifyCourseOwnership(course_id);
        const supabase = session.getClient();

        const { data: course } = await supabase
          .from("courses")
          .select("title, status")
          .eq("course_id", course_id)
          .single();

        const { count: enrollmentCount } = await supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("course_id", course_id)
          .eq("status", "active");

        const { data: lessons } = await supabase
          .from("lessons")
          .select("id")
          .eq("course_id", course_id)
          .eq("status", "published");

        const lessonCount = lessons?.length ?? 0;

        let completionRate = 0;
        if (lessonCount > 0 && (enrollmentCount ?? 0) > 0) {
          // lesson_completions has NO tenant_id — filter only by lesson_id
          const { count: completionCount } = await supabase
            .from("lesson_completions")
            .select("*", { count: "exact", head: true })
            .in("lesson_id", lessons!.map((l) => l.id));

          const totalPossible = lessonCount * (enrollmentCount ?? 0);
          completionRate = Math.round(((completionCount ?? 0) / totalPossible) * 100);
        }

        const { data: exams } = await supabase
          .from("exams")
          .select("exam_id")
          .eq("course_id", course_id);

        let avgScore = 0;
        let totalSubmissions = 0;
        if (exams && exams.length > 0) {
          const { data: submissions } = await supabase
            .from("exam_submissions")
            .select("score")
            .in("exam_id", exams.map((e) => e.exam_id))
            .not("score", "is", null);

          if (submissions && submissions.length > 0) {
            totalSubmissions = submissions.length;
            const sum = submissions.reduce((acc, s) => acc + (s.score ?? 0), 0);
            avgScore = Math.round(sum / submissions.length);
          }
        }

        const output = {
          course_id,
          title: course?.title,
          status: course?.status,
          active_enrollments: enrollmentCount ?? 0,
          published_lessons: lessonCount,
          completion_rate: completionRate,
          exam_count: exams?.length ?? 0,
          submission_count: totalSubmissions,
          average_score: totalSubmissions > 0 ? avgScore : null,
        };

        let result = `# Course Stats: ${course?.title ?? `Course ${course_id}`}\n\n`;
        result += `**Status:** ${course?.status ?? "unknown"}\n`;
        result += `**Active Enrollments:** ${output.active_enrollments}\n`;
        result += `**Published Lessons:** ${output.published_lessons}\n`;
        result += `**Lesson Completion Rate:** ${output.completion_rate}%\n`;
        result += `**Total Exams:** ${output.exam_count}\n`;
        result += `**Exam Submissions:** ${output.submission_count}\n`;
        result += `**Average Exam Score:** ${
          output.average_score !== null ? `${output.average_score}%` : "N/A"
        }`;

        return ok(output as unknown as Record<string, unknown>, result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
