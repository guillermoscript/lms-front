import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerAnalyticsTools(server: McpServer, auth: AuthManager) {
  server.tool(
    "list_enrollments",
    "List students enrolled in a course with their enrollment status.",
    {
      course_id: z.number().describe("The course ID"),
      status: z.enum(["active", "disabled"]).optional().describe("Filter by enrollment status"),
    },
    async ({ course_id, status }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        let query = supabase
          .from("enrollments")
          .select(
            `enrollment_id, status, enrollment_date, user_id,
            profiles:user_id(full_name, email)`
          )
          .eq("course_id", course_id)
          .order("enrollment_date", { ascending: false });

        if (status) query = query.eq("status", status);

        const { data, error } = await query;
        if (error) return textResult(`Error listing enrollments: ${error.message}`);
        if (!data || data.length === 0) return textResult("No enrollments found.");

        const lines = data.map((e) => {
          const profile = e.profiles as unknown as { full_name: string | null; email: string | null } | null;
          const name = profile?.full_name ?? profile?.email ?? e.user_id;
          return `- **${name}** [${e.status}] — enrolled ${e.enrollment_date}`;
        });

        return textResult(`${data.length} enrollment(s) for course ${course_id}:\n\n${lines.join("\n")}`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "list_exam_submissions",
    "List all submissions for an exam with scores.",
    { exam_id: z.number().describe("The exam ID") },
    async ({ exam_id }) => {
      try {
        await auth.verifyExamOwnership(exam_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("exam_submissions")
          .select(
            `submission_id, score, submission_date, review_status, student_id,
            profiles:student_id(full_name, email)`
          )
          .eq("exam_id", exam_id)
          .order("submission_date", { ascending: false });

        if (error) return textResult(`Error listing submissions: ${error.message}`);
        if (!data || data.length === 0) return textResult("No submissions found for this exam.");

        const lines = data.map((s) => {
          const profile = s.profiles as unknown as { full_name: string | null; email: string | null } | null;
          const name = profile?.full_name ?? profile?.email ?? s.student_id;
          return `- **${name}** — Score: ${s.score ?? "pending"} [${s.review_status}] (ID: ${s.submission_id})`;
        });

        return textResult(`${data.length} submission(s):\n\n${lines.join("\n")}`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "get_submission_details",
    "Get detailed submission with per-question answers and scores.",
    { submission_id: z.number().describe("The submission ID") },
    async ({ submission_id }) => {
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

        if (error || !data) return textResult(`Submission ${submission_id} not found.`);

        await auth.verifyExamOwnership(data.exam_id);

        const profile = data.profiles as unknown as { full_name: string | null; email: string | null } | null;
        const name = profile?.full_name ?? profile?.email ?? data.student_id;

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

        return textResult(result);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "get_course_stats",
    "Get aggregate statistics for a course: enrollment count, lesson completion rate, average exam score.",
    { course_id: z.number().describe("The course ID") },
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

        let result = `# Course Stats: ${course?.title ?? `Course ${course_id}`}\n\n`;
        result += `**Status:** ${course?.status ?? "unknown"}\n`;
        result += `**Active Enrollments:** ${enrollmentCount ?? 0}\n`;
        result += `**Published Lessons:** ${lessonCount}\n`;
        result += `**Lesson Completion Rate:** ${completionRate}%\n`;
        result += `**Total Exams:** ${exams?.length ?? 0}\n`;
        result += `**Exam Submissions:** ${totalSubmissions}\n`;
        result += `**Average Exam Score:** ${totalSubmissions > 0 ? `${avgScore}%` : "N/A"}`;

        return textResult(result);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );
}
