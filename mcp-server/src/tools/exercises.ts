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

const exerciseTypes = [
  "quiz",
  "coding_challenge",
  "essay",
  "multiple_choice",
  "true_false",
  "fill_in_the_blank",
  "discussion",
  "artifact",
] as const;
const difficultyLevels = ["easy", "medium", "hard"] as const;

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function replaceVariables(template: string, variables: Record<string, any>) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key]?.toString() ?? match;
  });
}

export function registerExerciseTools(server: McpServer, auth: AuthManager) {
  server.registerTool(
    "lms_list_exercises",
    {
      title: "List Exercises",
      description: "List exercises for a course, optionally filtered by lesson.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          course_id: z.number().describe("The course ID"),
          lesson_id: z.number().optional().describe("Filter by lesson ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id, lesson_id, limit, offset, response_format }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        let query = supabase
          .from("exercises")
          .select("id, title, exercise_type, difficulty_level, lesson_id, time_limit, created_at", { count: "exact" })
          .eq("course_id", course_id)
          .order("created_at")
          .range(offset, offset + limit - 1);

        if (lesson_id) query = query.eq("lesson_id", lesson_id);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing exercises: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: "No exercises found." }] };
        }

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset: total > offset + data.length ? offset + data.length : undefined,
          exercises: data.map((e) => ({
            id: e.id,
            title: e.title,
            type: e.exercise_type,
            difficulty: e.difficulty_level,
            lesson_id: e.lesson_id,
            time_limit: e.time_limit,
            created_at: e.created_at,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Exercises for course ${course_id}`, `Showing ${data.length} of ${total} exercises`, ""];
          for (const e of output.exercises) {
            lines.push(
              `- **${e.title}** (ID: ${e.id}) [${e.type}] [${e.difficulty}]${e.lesson_id ? ` (lesson ${e.lesson_id})` : ""}${e.time_limit ? ` ${e.time_limit}min` : ""}`
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
    "lms_get_exercise",
    {
      title: "Get Exercise Details",
      description: "Get full exercise details including instructions and system prompt.",
      inputSchema: z
        .object({
          exercise_id: z.number().describe("The exercise ID"),
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
    async ({ exercise_id, response_format }) => {
      try {
        await auth.verifyExerciseOwnership(exercise_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase.from("exercises").select("*").eq("id", exercise_id).single();

        if (error || !data) return errorResult(`Exercise ${exercise_id} not found.`);

        const output = {
          exercise: {
            id: data.id,
            course_id: data.course_id,
            lesson_id: data.lesson_id,
            title: data.title,
            instructions: data.instructions,
            type: data.exercise_type,
            difficulty: data.difficulty_level,
            system_prompt: data.system_prompt,
            time_limit: data.time_limit,
            template_id: data.template_id,
            template_variables: data.template_variables,
          },
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          let result = `# ${data.title} (ID: ${data.id})\n\n`;
          result += `**Course ID:** ${data.course_id}\n`;
          result += `**Lesson ID:** ${data.lesson_id ?? "None"}\n`;
          result += `**Type:** ${data.exercise_type}\n`;
          result += `**Difficulty:** ${data.difficulty_level}\n`;
          result += `**Time Limit:** ${data.time_limit ? `${data.time_limit} min` : "None"}\n\n`;
          result += `## Instructions\n\n${data.instructions ?? "(empty)"}\n\n`;
          result += `## System Prompt\n\n${data.system_prompt ?? "(empty)"}`;
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
    "lms_list_templates",
    {
      title: "List Prompt Templates",
      description: "List available prompt templates for exercises and grading.",
      inputSchema: z
        .object({
          category: z.enum(["lesson_task", "exercise", "exam_grading"]).optional().describe("Filter by category"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ category }) => {
      try {
        const supabase = auth.getClient();
        let query = supabase
          .from("prompt_templates")
          .select("id, name, category, description, variables")
          .or(`is_system.eq.true,created_by.eq.${auth.getUserId()}`);
        if (category) query = query.eq("category", category);

        const { data, error } = await query;
        if (error) return errorResult(`Listing templates: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: "No templates found." }] };
        }

        const output = {
          templates: data.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            description: t.description,
            variables: t.variables?.variables || [],
          })),
        };

        const lines = output.templates.map(
          (t) =>
            `- **${t.name}** (ID: ${t.id}) [${t.category}]: ${t.description || "No description"}. Variables: ${JSON.stringify(t.variables)}`
        );

        return {
          content: [{ type: "text", text: `Found ${data.length} template(s):\n\n${lines.join("\n")}` }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_create_exercise",
    {
      title: "Create Exercise",
      description: "Create a new practice exercise for a course.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
          lesson_id: z.number().optional().describe("Optional lesson ID to link to"),
          title: z.string().min(1).describe("Exercise title"),
          instructions: z.string().optional().describe("Exercise instructions (required if no template_id)"),
          exercise_type: z.enum(exerciseTypes).describe("Type of exercise"),
          difficulty_level: z.enum(difficultyLevels).describe("Difficulty level"),
          system_prompt: z.string().optional().describe("AI system prompt (optional if using template)"),
          time_limit: z.number().int().optional().describe("Time limit in minutes"),
          template_id: z.number().optional().describe("Prompt template ID"),
          template_variables: z.record(z.any()).optional().describe("Variables for the template"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      course_id,
      lesson_id,
      title,
      instructions,
      exercise_type,
      difficulty_level,
      system_prompt,
      time_limit,
      template_id,
      template_variables,
    }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        let finalInstructions = instructions || "";
        let finalSystemPrompt = system_prompt || null;

        if (template_id) {
          const { data: template, error: tError } = await supabase
            .from("prompt_templates")
            .select("*")
            .eq("id", template_id)
            .single();

          if (tError || !template) return errorResult(`Template ${template_id} not found.`);

          if (!instructions && template.task_description_template) {
            finalInstructions = replaceVariables(template.task_description_template, template_variables || {});
          }
          if (!system_prompt && template.system_prompt_template) {
            finalSystemPrompt = replaceVariables(template.system_prompt_template, template_variables || {});
          }
        }

        if (!finalInstructions) {
          return errorResult("Instructions are required (either directly or via template).");
        }

        const { data, error } = await supabase
          .from("exercises")
          .insert({
            course_id,
            lesson_id: lesson_id ?? null,
            title,
            instructions: finalInstructions,
            exercise_type,
            difficulty_level,
            system_prompt: finalSystemPrompt,
            time_limit: time_limit ?? null,
            created_by: auth.getUserId(),
            tenant_id: auth.getTenantId(),
            template_id: template_id ?? null,
            template_variables: template_variables ?? null,
          })
          .select("id, title, exercise_type, difficulty_level")
          .single();

        if (error) return errorResult(`Creating exercise: ${error.message}`);

        return {
          content: [
            {
              type: "text",
              text: `Exercise created: **${data.title}** (ID: ${data.id}) [${data.exercise_type}] [${data.difficulty_level}]`,
            },
          ],
          structuredContent: {
            id: data.id,
            title: data.title,
            type: data.exercise_type,
            difficulty: data.difficulty_level,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_create_artifact_exercise",
    {
      title: "Create Artifact Exercise",
      description:
        "Create an interactive artifact exercise using custom HTML that renders in a sandboxed iframe. Students interact with the HTML and submit their work for AI-powered evaluation.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
          lesson_id: z.number().optional().describe("Optional lesson ID to link to"),
          title: z.string().min(1).describe("Exercise title"),
          instructions: z.string().describe("Instructions visible to students"),
          artifact_html: z.string().describe("Full interactive HTML to render in sandboxed iframe"),
          artifact_type: z
            .enum(["code_editor", "spreadsheet", "essay", "simulation", "custom"])
            .describe("Type of artifact"),
          evaluation_criteria: z
            .string()
            .describe("Server-side only criteria for AI evaluation (never sent to browser)"),
          system_prompt: z
            .string()
            .optional()
            .describe("Optional AI evaluator persona/system prompt (server-side only)"),
          difficulty_level: z.enum(difficultyLevels).describe("Difficulty level"),
          passing_score: z.number().int().min(0).max(100).default(70).describe("Minimum score to pass (default 70)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      course_id,
      lesson_id,
      title,
      instructions,
      artifact_html,
      artifact_type,
      evaluation_criteria,
      system_prompt,
      difficulty_level,
      passing_score,
    }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const exercise_config = {
          artifact_type,
          artifact_html,
          evaluation_criteria,
          system_prompt: system_prompt ?? null,
          passing_score: passing_score ?? 70,
        };

        const { data, error } = await supabase
          .from("exercises")
          .insert({
            course_id,
            lesson_id: lesson_id ?? null,
            title,
            instructions,
            exercise_type: "artifact" as any,
            difficulty_level,
            exercise_config,
            created_by: auth.getUserId(),
            tenant_id: auth.getTenantId(),
          })
          .select("id, title, exercise_type, difficulty_level")
          .single();

        if (error) return errorResult(`Creating artifact exercise: ${error.message}`);

        return {
          content: [
            {
              type: "text",
              text: `Artifact exercise created: **${data.title}** (ID: ${data.id}) [${artifact_type}] [${data.difficulty_level}]`,
            },
          ],
          structuredContent: {
            id: data.id,
            title: data.title,
            type: data.exercise_type,
            artifact_type,
            difficulty: data.difficulty_level,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_update_artifact_exercise",
    {
      title: "Update Artifact Exercise",
      description: "Update an artifact exercise's HTML, evaluation criteria, or other fields.",
      inputSchema: z
        .object({
          exercise_id: z.number().describe("The exercise ID"),
          title: z.string().optional().describe("New title"),
          instructions: z.string().optional().describe("New instructions"),
          artifact_html: z.string().optional().describe("New HTML content"),
          artifact_type: z
            .enum(["code_editor", "spreadsheet", "essay", "simulation", "custom"])
            .optional()
            .describe("New artifact type"),
          evaluation_criteria: z.string().optional().describe("New evaluation criteria"),
          system_prompt: z.string().optional().describe("New system prompt"),
          difficulty_level: z.enum(difficultyLevels).optional().describe("New difficulty"),
          passing_score: z.number().int().min(0).max(100).optional().describe("New passing score"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      exercise_id,
      title,
      instructions,
      artifact_html,
      artifact_type,
      evaluation_criteria,
      system_prompt,
      difficulty_level,
      passing_score,
    }) => {
      try {
        await auth.verifyExerciseOwnership(exercise_id);
        const supabase = auth.getClient();

        // Fetch current exercise to merge config
        const { data: current, error: fetchError } = await supabase
          .from("exercises")
          .select("exercise_config, exercise_type")
          .eq("id", exercise_id)
          .single();

        if (fetchError || !current) return errorResult(`Exercise ${exercise_id} not found.`);
        if (current.exercise_type !== "artifact") {
          return errorResult(`Exercise ${exercise_id} is not an artifact exercise.`);
        }

        const currentConfig = (current.exercise_config as Record<string, any>) ?? {};
        const updatedConfig = { ...currentConfig };

        if (artifact_html !== undefined) updatedConfig.artifact_html = artifact_html;
        if (artifact_type !== undefined) updatedConfig.artifact_type = artifact_type;
        if (evaluation_criteria !== undefined) updatedConfig.evaluation_criteria = evaluation_criteria;
        if (system_prompt !== undefined) updatedConfig.system_prompt = system_prompt;
        if (passing_score !== undefined) updatedConfig.passing_score = passing_score;

        const updateData: Record<string, unknown> = { exercise_config: updatedConfig };
        if (title !== undefined) updateData.title = title;
        if (instructions !== undefined) updateData.instructions = instructions;
        if (difficulty_level !== undefined) updateData.difficulty_level = difficulty_level;

        const { data, error } = await supabase
          .from("exercises")
          .update(updateData)
          .eq("id", exercise_id)
          .select("id, title, exercise_type, difficulty_level")
          .single();

        if (error) return errorResult(`Updating artifact exercise: ${error.message}`);

        return {
          content: [{ type: "text", text: `Artifact exercise updated: **${data.title}** (ID: ${data.id})` }],
          structuredContent: {
            id: data.id,
            title: data.title,
            type: data.exercise_type,
            difficulty: data.difficulty_level,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_delete_exercise",
    {
      title: "Delete Exercise",
      description: "Permanently delete a practice exercise. This action is irreversible.",
      inputSchema: z.object({ exercise_id: z.number().describe("The exercise ID to delete") }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ exercise_id }) => {
      try {
        await auth.verifyExerciseOwnership(exercise_id);
        const supabase = auth.getClient();

        const { data: exercise } = await supabase
          .from("exercises")
          .select("title")
          .eq("id", exercise_id)
          .single();

        const { error } = await supabase.from("exercises").delete().eq("id", exercise_id);
        if (error) return errorResult(`Deleting exercise: ${error.message}`);

        return {
          content: [{ type: "text", text: `Exercise "${exercise?.title ?? exercise_id}" (ID: ${exercise_id}) has been deleted.` }],
          structuredContent: { success: true, deleted_exercise_id: exercise_id },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_update_exercise",
    {
      title: "Update Exercise",
      description: "Update practice exercise fields.",
      inputSchema: z
        .object({
          exercise_id: z.number().describe("The exercise ID"),
          title: z.string().optional().describe("New title"),
          instructions: z.string().optional().describe("New instructions"),
          exercise_type: z.enum(exerciseTypes).optional().describe("New type"),
          difficulty_level: z.enum(difficultyLevels).optional().describe("New difficulty"),
          system_prompt: z.string().optional().describe("New system prompt"),
          time_limit: z.number().int().optional().describe("New time limit in minutes"),
          lesson_id: z.number().optional().describe("New lesson ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      exercise_id,
      title,
      instructions,
      exercise_type,
      difficulty_level,
      system_prompt,
      time_limit,
      lesson_id,
    }) => {
      try {
        await auth.verifyExerciseOwnership(exercise_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (instructions !== undefined) updateData.instructions = instructions;
        if (exercise_type !== undefined) updateData.exercise_type = exercise_type;
        if (difficulty_level !== undefined) updateData.difficulty_level = difficulty_level;
        if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
        if (time_limit !== undefined) updateData.time_limit = time_limit;
        if (lesson_id !== undefined) updateData.lesson_id = lesson_id;

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: "text", text: "No fields to update." }] };
        }

        const { data, error } = await supabase
          .from("exercises")
          .update(updateData)
          .eq("id", exercise_id)
          .select("id, title, exercise_type, difficulty_level")
          .single();

        if (error) return errorResult(`Updating exercise: ${error.message}`);
        return {
          content: [{ type: "text", text: `Exercise updated: **${data.title}** (ID: ${data.id})` }],
          structuredContent: {
            id: data.id,
            title: data.title,
            type: data.exercise_type,
            difficulty: data.difficulty_level,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
