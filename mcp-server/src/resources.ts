import type { LmsServer } from "./server-types.js";
import { object, error } from "mcp-use";
import { LmsSession } from "./session.js";
import { EXAM_GRADING_SECRETS_EMBED, withExamGradingSecrets } from "./exam-grading-secrets.js";

export function registerResources(server: LmsServer) {
  // ── course://{courseId} ────────────────────────────────────────────────────
  server.resourceTemplate(
    {
      name: "course",
      uriTemplate: "course://{courseId}",
      title: "LMS Course",
      description: "Full course data including lessons and exams",
      mimeType: "application/json",
    },
    async (uri: URL, params, ctx) => {
      const courseId = parseInt(String(params.courseId), 10);
      if (isNaN(courseId)) {
        return error("Invalid course ID");
      }

      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
        await session.verifyCourseOwnership(courseId);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();

        const { data, error: dbError } = await supabase
          .from("courses")
          .select(
            `*, lessons(id, title, sequence, status, description),
            exams(exam_id, title, exam_date, duration, status, exam_questions(count)),
            enrollments(count)`
          )
          .eq("course_id", courseId)
          .order("sequence", { referencedTable: "lessons" })
          .single();

        if (dbError || !data) {
          return error(`Course ${courseId} not found`);
        }

        return object(data as Record<string, unknown>);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lesson://{lessonId} ────────────────────────────────────────────────────
  server.resourceTemplate(
    {
      name: "lesson",
      uriTemplate: "lesson://{lessonId}",
      title: "LMS Lesson",
      description: "Full lesson data including MDX content",
      mimeType: "application/json",
    },
    async (uri: URL, params, ctx) => {
      const lessonId = parseInt(String(params.lessonId), 10);
      if (isNaN(lessonId)) {
        return error("Invalid lesson ID");
      }

      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
        await session.verifyLessonOwnership(lessonId);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();

        const { data, error: dbError } = await supabase
          .from("lessons")
          .select("*")
          .eq("id", lessonId)
          .single();

        if (dbError || !data) {
          return error(`Lesson ${lessonId} not found`);
        }

        return object(data as Record<string, unknown>);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── exam://{examId} ────────────────────────────────────────────────────────
  server.resourceTemplate(
    {
      name: "exam",
      uriTemplate: "exam://{examId}",
      title: "LMS Exam",
      description: "Full exam data with questions and options",
      mimeType: "application/json",
    },
    async (uri: URL, params, ctx) => {
      const examId = parseInt(String(params.examId), 10);
      if (isNaN(examId)) {
        return error("Invalid exam ID");
      }

      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
        await session.verifyExamOwnership(examId);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();

        const { data, error: dbError } = await supabase
          .from("exams")
          .select(
            `*, exam_questions(question_id, question_text, question_type,
              question_options(option_id, option_text),
              ${EXAM_GRADING_SECRETS_EMBED}
            )`
          )
          .eq("exam_id", examId)
          .single();

        if (dbError || !data) {
          return error(`Exam ${examId} not found`);
        }

        // The key lives in staff-only exam_grading_secrets (#840); put back the
        // fields this resource always carried.
        const exam = data as Record<string, unknown> & { exam_questions?: any[] | null };
        const examQuestions = (exam.exam_questions ?? []).map((q) => {
          const { correct_answer: _a, grading_rubric: _r, ...merged } = withExamGradingSecrets(q);
          return merged;
        });
        return object({ ...exam, exam_questions: examQuestions } as Record<string, unknown>);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
