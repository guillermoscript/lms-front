import type { MCPServer } from "mcp-use/server";
import { object, error } from "mcp-use/server";
import { LmsSession } from "./session.js";

export function registerResources(server: MCPServer) {
  // ── course://{courseId} ────────────────────────────────────────────────────
  server.resourceTemplate(
    {
      name: "course",
      uriTemplate: "course://{courseId}",
      title: "LMS Course",
      description: "Full course data including lessons and exams",
      mimeType: "application/json",
    },
    async (uri: URL, params: Record<string, string>, ctx) => {
      const courseId = parseInt(params.courseId, 10);
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
    async (uri: URL, params: Record<string, string>, ctx) => {
      const lessonId = parseInt(params.lessonId, 10);
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
    async (uri: URL, params: Record<string, string>, ctx) => {
      const examId = parseInt(params.examId, 10);
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
            `*, exam_questions(question_id, question_text, question_type, ai_grading_criteria, expected_keywords,
              question_options(option_id, option_text, is_correct)
            )`
          )
          .eq("exam_id", examId)
          .single();

        if (dbError || !data) {
          return error(`Exam ${examId} not found`);
        }

        return object(data as Record<string, unknown>);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
