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

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function registerExamTools(server: McpServer, auth: AuthManager) {
  server.registerTool(
    "lms_list_exams",
    {
      title: "List Exams",
      description: "List all exams for a course with basic metadata and question counts.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          course_id: z.number().describe("The course ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id, limit, offset, response_format }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data, error, count } = await supabase
          .from("exams")
          .select("exam_id, title, description, exam_date, duration, status, created_at, exam_questions(count)", {
            count: "exact",
          })
          .eq("course_id", course_id)
          .order("created_at")
          .range(offset, offset + limit - 1);

        if (error) return errorResult(`Listing exams: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: "No exams found for this course." }] };
        }

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset: total > offset + data.length ? offset + data.length : undefined,
          exams: data.map((e) => ({
            id: e.exam_id,
            title: e.title,
            description: e.description,
            date: e.exam_date,
            duration: e.duration,
            status: e.status,
            question_count: (e.exam_questions as any)?.[0]?.count ?? 0,
            created_at: e.created_at,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Exams for course ${course_id}`, `Showing ${data.length} of ${total} exams`, ""];
          for (const e of output.exams) {
            lines.push(
              `- **${e.title}** (ID: ${e.id}) [${e.status}] — ${e.question_count} questions, ${e.duration} min`
            );
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
    "lms_get_exam",
    {
      title: "Get Exam Details",
      description: "Get full exam details including all questions and their options.",
      inputSchema: z
        .object({
          exam_id: z.number().describe("The exam ID"),
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
    async ({ exam_id, response_format }) => {
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
          .order("question_id", { referencedTable: "exam_questions" })
          .single();

        if (error || !data) return errorResult(`Exam ${exam_id} not found.`);

        const output = {
          exam: {
            id: data.exam_id,
            title: data.title,
            description: data.description,
            date: data.exam_date,
            duration: data.duration,
            status: data.status,
            course_id: data.course_id,
          },
          questions: (data.exam_questions as any[]).map((q) => ({
            id: q.question_id,
            text: q.question_text,
            type: q.question_type,
            ai_grading_criteria: q.ai_grading_criteria,
            expected_keywords: q.expected_keywords,
            options: (q.question_options as any[]).map((o) => ({
              id: o.option_id,
              text: o.option_text,
              is_correct: o.is_correct,
            })),
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          let result = `# ${data.title} (ID: ${data.exam_id})\n\n`;
          result += `**Course ID:** ${data.course_id}\n`;
          result += `**Status:** ${data.status}\n`;
          result += `**Duration:** ${data.duration} minutes\n`;
          result += `**Exam Date:** ${data.exam_date ?? "TBD"}\n`;
          result += `**Description:** ${data.description ?? "None"}\n\n`;

          if (output.questions.length > 0) {
            result += `## Questions (${output.questions.length})\n\n`;
            for (let i = 0; i < output.questions.length; i++) {
              const q = output.questions[i];
              result += `### Q${i + 1}: ${q.text}\n`;
              result += `**Type:** ${q.type} | **ID:** ${q.id}\n`;
              if (q.ai_grading_criteria) result += `**AI Criteria:** ${q.ai_grading_criteria}\n`;
              if (q.expected_keywords?.length) result += `**Keywords:** ${q.expected_keywords.join(", ")}\n`;
              if (q.options.length > 0) {
                for (const o of q.options) {
                  result += `  ${o.is_correct ? "+" : "o"} ${o.text} (ID: ${o.id})\n`;
                }
              }
              result += "\n";
            }
          } else {
            result += "## Questions\nNo questions yet.\n";
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
    "lms_create_exam",
    {
      title: "Create Exam",
      description:
        "Create a new exam with optional questions and options in a single call. Recommended for bulk creation.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
          title: z.string().min(1).describe("Exam title"),
          description: z.string().optional().describe("Exam description"),
          exam_date: z.string().optional().describe("Exam date (ISO format)"),
          duration: z.number().int().min(1).describe("Duration in minutes"),
          questions: z.array(questionSchema).optional().describe("Array of questions with options"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
            tenant_id: auth.getTenantId(),
          })
          .select("exam_id, title, status")
          .single();

        if (examError) return errorResult(`Creating exam: ${examError.message}`);

        const output: any = {
          exam: {
            id: exam.exam_id,
            title: exam.title,
            status: exam.status,
          },
          questions: [],
        };

        if (!questions || questions.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Exam created: **${exam.title}** (ID: ${exam.exam_id}) [${exam.status}] — No questions yet.\n\nUse \`lms_add_exam_question\` to add questions.`,
              },
            ],
            structuredContent: output,
          };
        }

        const createdQuestions: string[] = [];
        const errors: string[] = [];

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if ((q.question_type === "multiple_choice" || q.question_type === "true_false") && (!q.options || q.options.length === 0)) {
            errors.push(`Q${i + 1}: type '${q.question_type}' requires at least one option`);
            continue;
          }

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

          let createdOptions: any[] = [];
          if (q.options && q.options.length > 0) {
            const optionsData = q.options.map((o) => ({
              question_id: question.question_id,
              option_text: o.option_text,
              is_correct: o.is_correct,
            }));

            const { data: opts, error: oError } = await supabase
              .from("question_options")
              .insert(optionsData)
              .select("option_id, option_text, is_correct");
            if (oError) {
              errors.push(`Q${i + 1} options: ${oError.message}`);
            } else {
              createdOptions = opts || [];
            }
          }

          output.questions.push({
            id: question.question_id,
            text: question.question_text,
            type: question.question_type,
            options: createdOptions,
          });
          createdQuestions.push(`Q${i + 1}: ${question.question_text} (ID: ${question.question_id})`);
        }

        let result = `Exam created: **${exam.title}** (ID: ${exam.exam_id}) [${exam.status}]\n\n`;
        result += `Questions created (${createdQuestions.length}/${questions.length}):\n`;
        result += createdQuestions.map((q) => `- ${q}`).join("\n");

        if (errors.length > 0) {
          result += `\n\nErrors:\n${errors.map((e) => `- ${e}`).join("\n")}`;
        }

        return {
          content: [{ type: "text", text: result }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_update_exam",
    {
      title: "Update Exam",
      description: "Update exam metadata like title, description, duration, or status.",
      inputSchema: z
        .object({
          exam_id: z.number().describe("The exam ID"),
          title: z.string().optional().describe("New title"),
          description: z.string().optional().describe("New description"),
          duration: z.number().optional().describe("New duration in minutes"),
          exam_date: z.string().optional().describe("New exam date (ISO format)"),
          status: z.enum(["draft", "published", "archived"]).optional().describe("New status"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: "text", text: "No fields to update." }] };
        }

        const { data, error } = await supabase
          .from("exams")
          .update(updateData)
          .eq("exam_id", exam_id)
          .select("exam_id, title, status")
          .single();

        if (error) return errorResult(`Updating exam: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Exam updated: **${data.title}** (ID: ${data.exam_id}) [${data.status}]`,
            },
          ],
          structuredContent: {
            id: data.exam_id,
            title: data.title,
            status: data.status,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_add_exam_question",
    {
      title: "Add Exam Question",
      description: "Add a single question to an existing exam.",
      inputSchema: z
        .object({
          exam_id: z.number().describe("The exam ID"),
          question_text: z.string().min(1).describe("The question text"),
          question_type: z.enum(questionTypes).describe("Type of question"),
          options: z.array(optionSchema).optional().describe("Options for multiple_choice/true_false"),
          ai_grading_criteria: z.string().optional().describe("AI grading criteria for free_text"),
          expected_keywords: z.array(z.string()).optional().describe("Expected keywords for free_text"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ exam_id, question_text, question_type, options, ai_grading_criteria, expected_keywords }) => {
      try {
        if ((question_type === "multiple_choice" || question_type === "true_false") && (!options || options.length === 0)) {
          return errorResult(`Questions of type '${question_type}' require at least one option.`);
        }

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

        if (qError) return errorResult(`Adding question: ${qError.message}`);

        let createdOptions: any[] = [];
        if (options && options.length > 0) {
          const optionsData = options.map((o) => ({
            question_id: question.question_id,
            option_text: o.option_text,
            is_correct: o.is_correct,
          }));

          const { data: opts, error: oError } = await supabase
            .from("question_options")
            .insert(optionsData)
            .select("option_id, option_text, is_correct");
          if (oError) {
            return errorResult(`Question created (ID: ${question.question_id}) but options failed: ${oError.message}`);
          }
          createdOptions = opts || [];
        }

        return {
          content: [
            {
              type: "text",
              text: `Question added: "${question.question_text}" (ID: ${question.question_id}) [${question.question_type}]`,
            },
          ],
          structuredContent: {
            id: question.question_id,
            text: question.question_text,
            type: question.question_type,
            options: createdOptions,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_update_exam_question",
    {
      title: "Update Exam Question",
      description: "Update an exam question's text, type, or grading criteria.",
      inputSchema: z
        .object({
          question_id: z.number().describe("The question ID"),
          question_text: z.string().optional().describe("New question text"),
          question_type: z.enum(questionTypes).optional().describe("New question type"),
          ai_grading_criteria: z.string().optional().describe("New AI grading criteria"),
          expected_keywords: z.array(z.string()).optional().describe("New expected keywords"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: "text", text: "No fields to update." }] };
        }

        const { data, error } = await supabase
          .from("exam_questions")
          .update(updateData)
          .eq("question_id", question_id)
          .select("question_id, question_text, question_type")
          .single();

        if (error) return errorResult(`Updating question: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Question updated: "${data.question_text}" (ID: ${data.question_id}) [${data.question_type}]`,
            },
          ],
          structuredContent: {
            id: data.question_id,
            text: data.question_text,
            type: data.question_type,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_delete_exam",
    {
      title: "Delete Exam",
      description:
        "Permanently delete an exam and all its questions, options, and submissions. This action is irreversible. Only use on draft exams or when sure there are no important submissions.",
      inputSchema: z.object({ exam_id: z.number().describe("The exam ID to delete") }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ exam_id }) => {
      try {
        await auth.verifyExamOwnership(exam_id);
        const supabase = auth.getClient();

        const { data: exam } = await supabase
          .from("exams")
          .select("title")
          .eq("exam_id", exam_id)
          .single();

        const { error } = await supabase.from("exams").delete().eq("exam_id", exam_id);
        if (error) return errorResult(`Deleting exam: ${error.message}`);

        return {
          content: [{ type: "text", text: `Exam "${exam?.title ?? exam_id}" (ID: ${exam_id}) and all its questions have been deleted.` }],
          structuredContent: { success: true, deleted_exam_id: exam_id },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_delete_exam_question",
    {
      title: "Delete Exam Question",
      description: "Delete an exam question and all its options.",
      inputSchema: z.object({ question_id: z.number().describe("The question ID to delete") }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ question_id }) => {
      try {
        await auth.verifyQuestionOwnership(question_id);
        const supabase = auth.getClient();

        // question_options has ON DELETE CASCADE in most cases, but let's be explicit if needed
        await supabase.from("question_options").delete().eq("question_id", question_id);
        const { error } = await supabase.from("exam_questions").delete().eq("question_id", question_id);

        if (error) return errorResult(`Deleting question: ${error.message}`);
        return {
          content: [{ type: "text", text: `Question ${question_id} and its options have been deleted.` }],
          structuredContent: { success: true, deleted_question_id: question_id },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
