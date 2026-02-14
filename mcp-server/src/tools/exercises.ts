import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";

const exerciseTypes = [
  "quiz", "coding_challenge", "essay", "multiple_choice", "true_false", "fill_in_the_blank", "discussion",
] as const;
const difficultyLevels = ["easy", "medium", "hard"] as const;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function replaceVariables(template: string, variables: Record<string, any>) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key]?.toString() ?? match;
  });
}

export function registerExerciseTools(server: McpServer, auth: AuthManager) {
  server.tool(
    "list_exercises",
    "List exercises for a course, optionally filtered by lesson.",
    {
      course_id: z.number().describe("The course ID"),
      lesson_id: z.number().optional().describe("Filter by lesson ID"),
    },
    async ({ course_id, lesson_id }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        let query = supabase
          .from("exercises")
          .select("id, title, exercise_type, difficulty_level, lesson_id, time_limit, created_at")
          .eq("course_id", course_id)
          .order("created_at");

        if (lesson_id) query = query.eq("lesson_id", lesson_id);

        const { data, error } = await query;
        if (error) return textResult(`Error listing exercises: ${error.message}`);
        if (!data || data.length === 0) return textResult("No exercises found.");

        const lines = data.map(
          (e) => `- **${e.title}** (ID: ${e.id}) [${e.exercise_type}] [${e.difficulty_level}]${e.lesson_id ? ` (lesson ${e.lesson_id})` : ""}${e.time_limit ? ` ${e.time_limit}min` : ""}`
        );

        return textResult(`Found ${data.length} exercise(s):\n\n${lines.join("\n")}`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "get_exercise",
    "Get full exercise details including instructions and system prompt.",
    { exercise_id: z.number().describe("The exercise ID") },
    async ({ exercise_id }) => {
      try {
        await auth.verifyExerciseOwnership(exercise_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("exercises")
          .select("*")
          .eq("id", exercise_id)
          .single();

        if (error || !data) return textResult(`Exercise ${exercise_id} not found.`);

        let result = `# ${data.title} (ID: ${data.id})\n\n`;
        result += `**Course ID:** ${data.course_id}\n`;
        result += `**Lesson ID:** ${data.lesson_id ?? "None"}\n`;
        result += `**Type:** ${data.exercise_type}\n`;
        result += `**Difficulty:** ${data.difficulty_level}\n`;
        result += `**Time Limit:** ${data.time_limit ? `${data.time_limit} min` : "None"}\n\n`;
        result += `**Template ID:** ${data.template_id ?? "None"}\n`;
        result += `**Template Variables:** ${data.template_variables ? JSON.stringify(data.template_variables) : "None"}\n\n`;
        result += `## Instructions\n\n${data.instructions ?? "(empty)"}\n\n`;
        result += `## System Prompt\n\n${data.system_prompt ?? "(empty)"}`;

        return textResult(result);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "list_templates",
    "List available prompt templates for exercises.",
    {
      category: z.enum(["lesson_task", "exercise", "exam_grading"]).optional().describe("Filter by category"),
    },
    async ({ category }) => {
      try {
        const supabase = auth.getClient();
        let query = supabase.from("prompt_templates").select("id, name, category, description, variables");
        if (category) query = query.eq("category", category);

        const { data, error } = await query;
        if (error) return textResult(`Error listing templates: ${error.message}`);
        if (!data || data.length === 0) return textResult("No templates found.");

        const lines = data.map(
          (t) => `- **${t.name}** (ID: ${t.id}) [${t.category}]: ${t.description || "No description"}. Variables: ${JSON.stringify(t.variables?.variables || [])}`
        );

        return textResult(`Found ${data.length} template(s):\n\n${lines.join("\n")}`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "create_exercise",
    "Create a new exercise for a course.",
    {
      course_id: z.number().describe("The course ID"),
      lesson_id: z.number().optional().describe("Optional lesson ID to link to"),
      title: z.string().describe("Exercise title"),
      instructions: z.string().optional().describe("Exercise instructions (required if no template_id)"),
      exercise_type: z.enum(exerciseTypes).describe("Type of exercise"),
      difficulty_level: z.enum(difficultyLevels).describe("Difficulty level"),
      system_prompt: z.string().optional().describe("AI system prompt (optional if using template)"),
      time_limit: z.number().optional().describe("Time limit in minutes"),
      template_id: z.number().optional().describe("Prompt template ID"),
      template_variables: z.record(z.any()).optional().describe("Variables for the template"),
    },
    async ({ course_id, lesson_id, title, instructions, exercise_type, difficulty_level, system_prompt, time_limit, template_id, template_variables }) => {
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

          if (tError || !template) return textResult(`Template ${template_id} not found.`);

          if (!instructions && template.task_description_template) {
            finalInstructions = replaceVariables(template.task_description_template, template_variables || {});
          }
          if (!system_prompt && template.system_prompt_template) {
            finalSystemPrompt = replaceVariables(template.system_prompt_template, template_variables || {});
          }
        }

        if (!finalInstructions) {
          return textResult("Error: Instructions are required (either directly or via template).");
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
            template_id: template_id ?? null,
            template_variables: template_variables ?? null,
          })
          .select("id, title, exercise_type, difficulty_level")
          .single();

        if (error) return textResult(`Error creating exercise: ${error.message}`);

        return textResult(
          `Exercise created: **${data.title}** (ID: ${data.id}) [${data.exercise_type}] [${data.difficulty_level}]`
        );
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "update_exercise",
    "Update exercise fields.",
    {
      exercise_id: z.number().describe("The exercise ID"),
      title: z.string().optional().describe("New title"),
      instructions: z.string().optional().describe("New instructions"),
      exercise_type: z.enum(exerciseTypes).optional().describe("New type"),
      difficulty_level: z.enum(difficultyLevels).optional().describe("New difficulty"),
      system_prompt: z.string().optional().describe("New system prompt"),
      time_limit: z.number().optional().describe("New time limit in minutes"),
      lesson_id: z.number().optional().describe("New lesson ID"),
    },
    async ({ exercise_id, title, instructions, exercise_type, difficulty_level, system_prompt, time_limit, lesson_id }) => {
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

        if (Object.keys(updateData).length === 0) return textResult("No fields to update.");

        const { data, error } = await supabase
          .from("exercises")
          .update(updateData)
          .eq("id", exercise_id)
          .select("id, title, exercise_type, difficulty_level")
          .single();

        if (error) return textResult(`Error updating exercise: ${error.message}`);
        return textResult(`Exercise updated: **${data.title}** (ID: ${data.id})`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );
}
