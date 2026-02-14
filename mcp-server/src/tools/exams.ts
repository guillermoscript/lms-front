import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";

const questionTypes = ["true_false", "multiple_choice", "free_text"] as const;

const optionSchema = z.object({
  option_text: z.string().describe("The option text"),
  is_correct: z.boolean().describe("Whether this is the correct option"),
});

const questionSchema = z.object({
  question_text: z.string().describe("The question text"),
  question_type: z.enum(questionTypes).describe("Type of question"),
  options: z.array(optionSchema).optional().describe("Options for multiple_choice/true_false questions"),
  ai_grading_criteria: z.string().optional().describe("AI grading criteria for free_text questions"),
  expected_keywords: z.array(z.string()).optional().describe("Expected keywords for free_text questions"),
});

type QuestionInput = z.infer<typeof questionSchema>;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerExamTools(server: McpServer, auth: AuthManager) {
  server.tool(
    "list_exams",
    "List all exams for a course.",
    { course_id: z.number().describe("The course ID") },
    async ({ course_id }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("exams")
          .select("exam_id, title, description, exam_date, duration, status, created_at, exam_questions(count)")
          .eq("course_id", course_id)
          .order("created_at");

        if (error) return textResult(`Error listing exams: ${error.message}`);
        if (!data || data.length === 0) return textResult("No exams found for this course.");

        const lines = data.map((e) => {
          const qCount = (e.exam_questions as unknown as { count: number }[])?.[0]?.count ?? 0;
          return `- **${e.title}** (ID: ${e.exam_id}) [${e.status}] — ${qCount} questions, ${e.duration} min`;
        });

        return textResult(`Found ${data.length} exam(s):\n\n${lines.join("\n")}`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "get_exam",
    "Get full exam details with all questions and their options.",
    { exam_id: z.number().describe("The exam ID") },
    async ({ exam_id }) => {
      try {
        await auth.verifyExamOwnership(exam_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("exams")
          .select(
            `exam_id, title, description, exam_date, duration, status, course_id,
            exam_questions(question_id, question_text, question_type, ai_grading_criteria, expected_keywords,
              question_options(option_id, option_text, is_correct)
            )`
          )
          .eq("exam_id", exam_id)
          .single();

        if (error || !data) return textResult(`Exam ${exam_id} not found.`);

        let result = `# ${data.title} (ID: ${data.exam_id})\n\n`;
        result += `**Course ID:** ${data.course_id}\n`;
        result += `**Status:** ${data.status}\n`;
        result += `**Duration:** ${data.duration} minutes\n`;
        result += `**Exam Date:** ${data.exam_date ?? "TBD"}\n`;
        result += `**Description:** ${data.description ?? "None"}\n\n`;

        const questions = data.exam_questions as unknown as {
          question_id: number; question_text: string; question_type: string;
          ai_grading_criteria: string | null; expected_keywords: string[] | null;
          question_options: { option_id: number; option_text: string; is_correct: boolean }[];
        }[];

        if (questions?.length > 0) {
          result += `## Questions (${questions.length})\n\n`;
          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            result += `### Q${i + 1}: ${q.question_text}\n`;
            result += `**Type:** ${q.question_type} | **ID:** ${q.question_id}\n`;
            if (q.ai_grading_criteria) result += `**AI Criteria:** ${q.ai_grading_criteria}\n`;
            if (q.expected_keywords?.length) result += `**Keywords:** ${q.expected_keywords.join(", ")}\n`;
            if (q.question_options?.length > 0) {
              for (const o of q.question_options) {
                result += `  ${o.is_correct ? "+" : "o"} ${o.option_text} (ID: ${o.option_id})\n`;
              }
            }
            result += "\n";
          }
        } else {
          result += "## Questions\nNo questions yet.\n";
        }

        return textResult(result);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "create_exam",
    "Create a new exam with questions and options in a single call. Creates the exam, then adds all questions with their options.",
    {
      course_id: z.number().describe("The course ID"),
      title: z.string().describe("Exam title"),
      description: z.string().optional().describe("Exam description"),
      exam_date: z.string().optional().describe("Exam date (ISO format)"),
      duration: z.number().describe("Duration in minutes"),
      questions: z.array(questionSchema).optional().describe("Array of questions with options"),
    },
    async ({ course_id, title, description, exam_date, duration, questions }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data: exam, error: examError } = await supabase
          .from("exams")
          .insert({
            course_id,
            title,
            description: description ?? null,
            exam_date: exam_date ?? null,
            duration,
            status: "draft",
            created_by: auth.getUserId(),
          })
          .select("exam_id, title, status")
          .single();

        if (examError) return textResult(`Error creating exam: ${examError.message}`);

        const typedQuestions = questions as QuestionInput[] | undefined;
        if (!typedQuestions || typedQuestions.length === 0) {
          return textResult(
            `Exam created: **${exam.title}** (ID: ${exam.exam_id}) [${exam.status}] — No questions yet.\n\nUse \`add_exam_question\` to add questions.`
          );
        }

        const createdQuestions: string[] = [];
        const errors: string[] = [];

        for (let i = 0; i < typedQuestions.length; i++) {
          const q = typedQuestions[i];
          const { data: question, error: qError } = await supabase
            .from("exam_questions")
            .insert({
              exam_id: exam.exam_id,
              question_text: q.question_text,
              question_type: q.question_type,
              ai_grading_criteria: q.ai_grading_criteria ?? null,
              expected_keywords: q.expected_keywords ?? null,
            })
            .select("question_id, question_text, question_type")
            .single();

          if (qError) {
            errors.push(`Q${i + 1}: ${qError.message}`);
            continue;
          }

          if (q.options && q.options.length > 0) {
            const optionsData = q.options.map((o) => ({
              question_id: question.question_id,
              option_text: o.option_text,
              is_correct: o.is_correct,
            }));

            const { error: oError } = await supabase.from("question_options").insert(optionsData);
            if (oError) errors.push(`Q${i + 1} options: ${oError.message}`);
          }

          createdQuestions.push(`Q${i + 1}: ${question.question_text} (ID: ${question.question_id})`);
        }

        let result = `Exam created: **${exam.title}** (ID: ${exam.exam_id}) [${exam.status}]\n\n`;
        result += `Questions created (${createdQuestions.length}/${typedQuestions.length}):\n`;
        result += createdQuestions.map((q) => `- ${q}`).join("\n");

        if (errors.length > 0) {
          result += `\n\nErrors:\n${errors.map((e) => `- ${e}`).join("\n")}`;
        }

        return textResult(result);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "update_exam",
    "Update exam metadata (title, description, duration, exam_date, status).",
    {
      exam_id: z.number().describe("The exam ID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      duration: z.number().optional().describe("New duration in minutes"),
      exam_date: z.string().optional().describe("New exam date (ISO format)"),
      status: z.enum(["draft", "published", "archived"]).optional().describe("New status"),
    },
    async ({ exam_id, title, description, duration, exam_date, status }) => {
      try {
        await auth.verifyExamOwnership(exam_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (duration !== undefined) updateData.duration = duration;
        if (exam_date !== undefined) updateData.exam_date = exam_date;
        if (status !== undefined) updateData.status = status;

        if (Object.keys(updateData).length === 0) return textResult("No fields to update.");

        const { data, error } = await supabase
          .from("exams")
          .update(updateData)
          .eq("exam_id", exam_id)
          .select("exam_id, title, status")
          .single();

        if (error) return textResult(`Error updating exam: ${error.message}`);
        return textResult(`Exam updated: **${data.title}** (ID: ${data.exam_id}) [${data.status}]`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "add_exam_question",
    "Add a question to an existing exam.",
    {
      exam_id: z.number().describe("The exam ID"),
      question_text: z.string().describe("The question text"),
      question_type: z.enum(questionTypes).describe("Type of question"),
      options: z.array(optionSchema).optional().describe("Options for multiple_choice/true_false"),
      ai_grading_criteria: z.string().optional().describe("AI grading criteria for free_text"),
      expected_keywords: z.array(z.string()).optional().describe("Expected keywords for free_text"),
    },
    async ({ exam_id, question_text, question_type, options, ai_grading_criteria, expected_keywords }) => {
      try {
        await auth.verifyExamOwnership(exam_id);
        const supabase = auth.getClient();

        const { data: question, error: qError } = await supabase
          .from("exam_questions")
          .insert({
            exam_id,
            question_text,
            question_type,
            ai_grading_criteria: ai_grading_criteria ?? null,
            expected_keywords: expected_keywords ?? null,
          })
          .select("question_id, question_text, question_type")
          .single();

        if (qError) return textResult(`Error adding question: ${qError.message}`);

        const typedOptions = options as { option_text: string; is_correct: boolean }[] | undefined;
        if (typedOptions && typedOptions.length > 0) {
          const optionsData = typedOptions.map((o) => ({
            question_id: question.question_id,
            option_text: o.option_text,
            is_correct: o.is_correct,
          }));

          const { error: oError } = await supabase.from("question_options").insert(optionsData);
          if (oError) return textResult(`Question created (ID: ${question.question_id}) but options failed: ${oError.message}`);
        }

        return textResult(
          `Question added: "${question.question_text}" (ID: ${question.question_id}) [${question.question_type}]`
        );
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "update_exam_question",
    "Update an exam question's text, type, or grading criteria.",
    {
      question_id: z.number().describe("The question ID"),
      question_text: z.string().optional().describe("New question text"),
      question_type: z.enum(questionTypes).optional().describe("New question type"),
      ai_grading_criteria: z.string().optional().describe("New AI grading criteria"),
      expected_keywords: z.array(z.string()).optional().describe("New expected keywords"),
    },
    async ({ question_id, question_text, question_type, ai_grading_criteria, expected_keywords }) => {
      try {
        await auth.verifyQuestionOwnership(question_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (question_text !== undefined) updateData.question_text = question_text;
        if (question_type !== undefined) updateData.question_type = question_type;
        if (ai_grading_criteria !== undefined) updateData.ai_grading_criteria = ai_grading_criteria;
        if (expected_keywords !== undefined) updateData.expected_keywords = expected_keywords;

        if (Object.keys(updateData).length === 0) return textResult("No fields to update.");

        const { data, error } = await supabase
          .from("exam_questions")
          .update(updateData)
          .eq("question_id", question_id)
          .select("question_id, question_text, question_type")
          .single();

        if (error) return textResult(`Error updating question: ${error.message}`);
        return textResult(`Question updated: "${data.question_text}" (ID: ${data.question_id}) [${data.question_type}]`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "delete_exam_question",
    "Delete an exam question and all its options.",
    { question_id: z.number().describe("The question ID to delete") },
    async ({ question_id }) => {
      try {
        await auth.verifyQuestionOwnership(question_id);
        const supabase = auth.getClient();

        await supabase.from("question_options").delete().eq("question_id", question_id);
        const { error } = await supabase.from("exam_questions").delete().eq("question_id", question_id);

        if (error) return textResult(`Error deleting question: ${error.message}`);
        return textResult(`Question ${question_id} and its options have been deleted.`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );
}
