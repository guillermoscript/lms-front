import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuthManager } from "./auth.js";

export function registerResources(server: McpServer, auth: AuthManager) {
  server.resource(
    "course",
    new ResourceTemplate("course://{courseId}", { list: undefined }),
    { description: "Full course data including lessons and exams", mimeType: "text/plain" },
    async (uri, variables) => {
      const courseId = parseInt(String(variables.courseId), 10);
      if (isNaN(courseId)) throw new Error("Invalid course ID");

      await auth.verifyCourseOwnership(courseId);
      const supabase = auth.getClient();

      const { data, error } = await supabase
        .from("courses")
        .select(
          `*, lessons(id, title, sequence, status, description),
          exams(exam_id, title, exam_date, duration, status, exam_questions(count)),
          enrollments(count)`
        )
        .eq("course_id", courseId)
        .order("sequence", { referencedTable: "lessons" })
        .single();

      if (error || !data) throw new Error(`Course ${courseId} not found`);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "lesson",
    new ResourceTemplate("lesson://{lessonId}", { list: undefined }),
    { description: "Full lesson data including MDX content", mimeType: "text/plain" },
    async (uri, variables) => {
      const lessonId = parseInt(String(variables.lessonId), 10);
      if (isNaN(lessonId)) throw new Error("Invalid lesson ID");

      await auth.verifyLessonOwnership(lessonId);
      const supabase = auth.getClient();

      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", lessonId)
        .single();

      if (error || !data) throw new Error(`Lesson ${lessonId} not found`);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "exam",
    new ResourceTemplate("exam://{examId}", { list: undefined }),
    { description: "Full exam data with questions and options", mimeType: "text/plain" },
    async (uri, variables) => {
      const examId = parseInt(String(variables.examId), 10);
      if (isNaN(examId)) throw new Error("Invalid exam ID");

      await auth.verifyExamOwnership(examId);
      const supabase = auth.getClient();

      const { data, error } = await supabase
        .from("exams")
        .select(
          `*, exam_questions(question_id, question_text, question_type, ai_grading_criteria, expected_keywords,
            question_options(option_id, option_text, is_correct)
          )`
        )
        .eq("exam_id", examId)
        .single();

      if (error || !data) throw new Error(`Exam ${examId} not found`);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );
}
