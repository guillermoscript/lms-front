import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";

enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

const PaginationSchema = {
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum results to return"),
  offset: z.number().int().min(0).default(0).describe("Number of results to skip for pagination"),
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format"),
};

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function registerAnalyticsTools(server: McpServer, auth: AuthManager) {
  server.registerTool(
    "lms_list_enrollments",
    {
      title: "List Course Enrollments",
      description: "List students enrolled in a course with their enrollment status and dates.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          course_id: z.number().describe("The course ID"),
          status: z.enum(["active", "disabled"]).optional().describe("Filter by enrollment status"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id, status, limit, offset, response_format }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        let query = supabase
          .from("enrollments")
          .select(
            `enrollment_id, status, enrollment_date, user_id,
            profiles:user_id(full_name, email)`,
            { count: "exact" }
          )
          .eq("course_id", course_id)
          .order("enrollment_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing enrollments: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: "No enrollments found." }] };
        }

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset: total > offset + data.length ? offset + data.length : undefined,
          enrollments: data.map((e) => {
            const profile = e.profiles as any;
            return {
              id: e.enrollment_id,
              status: e.status,
              date: e.enrollment_date,
              student_id: e.user_id,
              student_name: profile?.full_name ?? null,
              student_email: profile?.email ?? null,
            };
          }),
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
            const name = e.student_name ?? e.student_email ?? e.student_id;
            lines.push(`- **${name}** [${e.status}] — enrolled ${e.date}`);
          }
          textContent = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: textContent }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_list_exam_submissions",
    {
      title: "List Exam Submissions",
      description: "List all submissions for an exam with scores and review status.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          exam_id: z.number().describe("The exam ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ exam_id, limit, offset, response_format }) => {
      try {
        await auth.verifyExamOwnership(exam_id);
        const supabase = auth.getClient();

        const { data, error, count } = await supabase
          .from("exam_submissions")
          .select(
            `submission_id, score, submission_date, review_status, student_id,
            profiles:student_id(full_name, email)`,
            { count: "exact" }
          )
          .eq("exam_id", exam_id)
          .order("submission_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return errorResult(`Listing submissions: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: "No submissions found for this exam." }] };
        }

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset: total > offset + data.length ? offset + data.length : undefined,
          submissions: data.map((s) => {
            const profile = s.profiles as any;
            return {
              id: s.submission_id,
              score: s.score,
              date: s.submission_date,
              status: s.review_status,
              student_id: s.student_id,
              student_name: profile?.full_name ?? null,
              student_email: profile?.email ?? null,
            };
          }),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Exam Submissions (ID: ${exam_id})`, `Showing ${data.length} of ${total} submissions`, ""];
          for (const s of output.submissions) {
            const name = s.student_name ?? s.student_email ?? s.student_id;
            lines.push(`- **${name}** — Score: ${s.score ?? "pending"} [${s.status}] (ID: ${s.id})`);
          }
          textContent = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: textContent }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_get_submission_details",
    {
      title: "Get Submission Details",
      description: "Get full details for a specific exam submission, including AI grading data and feedback.",
      inputSchema: z
        .object({
          submission_id: z.number().describe("The submission ID"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ submission_id, response_format }) => {
      try {
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("exam_submissions")
          .select(
            `submission_id, score, submission_date, review_status, feedback, ai_data, student_id, exam_id,
            profiles:student_id(full_name, email)`
          )
          .eq("submission_id", submission_id)
          .single();

        if (error || !data) return errorResult(`Submission ${submission_id} not found.`);

        await auth.verifyExamOwnership(data.exam_id);

        const profile = data.profiles as any;
        const output = {
          submission: {
            id: data.submission_id,
            exam_id: data.exam_id,
            student_id: data.student_id,
            student_name: profile?.full_name ?? null,
            student_email: profile?.email ?? null,
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
          const name = output.submission.student_name ?? output.submission.student_email ?? output.submission.student_id;
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
            result += `## Feedback\n\n${typeof data.feedback === "string" ? data.feedback : JSON.stringify(data.feedback, null, 2)}`;
          }
          textContent = result;
        }

        return {
          content: [{ type: "text", text: textContent }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_get_course_stats",
    {
      title: "Get Course Statistics",
      description: "Get aggregate statistics for a course: enrollment, completion, and exam performance.",
      inputSchema: z.object({ course_id: z.number().describe("The course ID") }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

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
          const { count: completionCount } = await supabase
            .from("lesson_completions")
            .select("*", { count: "exact", head: true })
            .in("lesson_id", lessons!.map((l) => l.id));

          const totalPossible = lessonCount * (enrollmentCount ?? 0);
          completionRate = Math.round(((completionCount ?? 0) / totalPossible) * 100);
        }

        const { data: exams } = await supabase.from("exams").select("exam_id").eq("course_id", course_id);

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
        result += `**Average Exam Score:** ${output.average_score !== null ? `${output.average_score}%` : "N/A"}`;

        return {
          content: [{ type: "text", text: result }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
