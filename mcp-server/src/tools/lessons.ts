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

export function registerLessonTools(server: McpServer, auth: AuthManager) {
  server.registerTool(
    "lms_list_lessons",
    {
      title: "List Lessons",
      description: "List all lessons in a course, ordered by sequence number.",
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
          .from("lessons")
          .select("id, title, sequence, status, description, video_url, created_at", { count: "exact" })
          .eq("course_id", course_id)
          .order("sequence")
          .range(offset, offset + limit - 1);

        if (error) return errorResult(`Listing lessons: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: "No lessons found for this course." }] };
        }

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset: total > offset + data.length ? offset + data.length : undefined,
          lessons: data.map((l) => ({
            id: l.id,
            title: l.title,
            sequence: l.sequence,
            status: l.status,
            description: l.description,
            video_url: l.video_url,
            created_at: l.created_at,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Lessons for course ${course_id}`, `Showing ${data.length} of ${total} lessons`, ""];
          for (const l of output.lessons) {
            lines.push(
              `${l.sequence}. **${l.title}** (ID: ${l.id}) [${l.status}]${l.video_url ? " [has video]" : ""}`
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
    "lms_get_lesson",
    {
      title: "Get Lesson Details",
      description: "Get full lesson details including MDX content.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
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
    async ({ lesson_id, response_format }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("lessons")
          .select("id, title, description, content, sequence, status, video_url, course_id, created_at, updated_at")
          .eq("id", lesson_id)
          .single();

        if (error || !data) return errorResult(`Lesson ${lesson_id} not found.`);

        const output = {
          lesson: {
            id: data.id,
            title: data.title,
            description: data.description,
            content: data.content,
            sequence: data.sequence,
            status: data.status,
            video_url: data.video_url,
            course_id: data.course_id,
            created_at: data.created_at,
            updated_at: data.updated_at,
          },
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          let result = `# ${data.title} (ID: ${data.id})\n\n`;
          result += `**Course ID:** ${data.course_id}\n`;
          result += `**Sequence:** ${data.sequence}\n`;
          result += `**Status:** ${data.status}\n`;
          result += `**Description:** ${data.description ?? "None"}\n`;
          result += `**Video URL:** ${data.video_url ?? "None"}\n\n`;
          result += `## Content\n\n${data.content ?? "(empty)"}`;
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
    "lms_create_lesson",
    {
      title: "Create Lesson",
      description: "Create a new lesson in a course in draft status.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
          title: z.string().min(1).describe("Lesson title"),
          content: z.string().optional().describe("MDX content for the lesson"),
          sequence: z.number().int().describe("Order position (1-based)"),
          description: z.string().optional().describe("Short description"),
          video_url: z.string().url().optional().or(z.literal("")).describe("Video URL"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ course_id, title, content, sequence, description, video_url }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("lessons")
          .insert({
            course_id,
            title,
            content: content ?? null,
            sequence,
            description: description ?? null,
            video_url: video_url || null,
            status: "draft",
          })
          .select("id, title, sequence, status")
          .single();

        if (error) return errorResult(`Creating lesson: ${error.message}`);

        return {
          content: [
            {
              type: "text",
              text: `Lesson created: **${data.title}** (ID: ${data.id}) at position ${data.sequence} [${data.status}]\n\nUse \`lms_publish_lesson\` when ready to make it available.`,
            },
          ],
          structuredContent: {
            id: data.id,
            title: data.title,
            sequence: data.sequence,
            status: data.status,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_update_lesson",
    {
      title: "Update Lesson",
      description: "Update lesson fields like title, content, description, or status.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
          title: z.string().optional().describe("New title"),
          content: z.string().optional().describe("New MDX content"),
          description: z.string().optional().describe("New description"),
          video_url: z.string().url().optional().or(z.literal("")).describe("New video URL"),
          status: z.enum(["draft", "published"]).optional().describe("New status"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ lesson_id, title, content, description, video_url, status }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (description !== undefined) updateData.description = description;
        if (video_url !== undefined) updateData.video_url = video_url || null;
        if (status !== undefined) updateData.status = status;

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: "text", text: "No fields to update." }] };
        }

        const { data, error } = await supabase
          .from("lessons")
          .update(updateData)
          .eq("id", lesson_id)
          .select("id, title, status")
          .single();

        if (error) return errorResult(`Updating lesson: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Lesson updated: **${data.title}** (ID: ${data.id}) [${data.status}]`,
            },
          ],
          structuredContent: {
            id: data.id,
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
    "lms_update_lesson_content",
    {
      title: "Update Lesson Content",
      description: "Quickly update ONLY the MDX content of a lesson.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
          content: z.string().describe("The new MDX content"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ lesson_id, content }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("lessons")
          .update({ content })
          .eq("id", lesson_id)
          .select("id, title")
          .single();

        if (error) return errorResult(`Updating lesson content: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Lesson content updated for: **${data.title}** (ID: ${data.id})`,
            },
          ],
          structuredContent: {
            id: data.id,
            title: data.title,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // Tool to create or update the AI task attached to a lesson
  server.registerTool(
    "lms_upsert_lesson_ai_task",
    {
      title: "Upsert Lesson AI Task",
      description: "Create or update the AI task (instructions + system prompt) for a lesson.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
          task_instructions: z.string().optional().describe("Instructions the student should follow (task description)"),
          system_prompt: z.string().optional().describe("System prompt / persona for the AI tutor"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ lesson_id, task_instructions, system_prompt }) => {
      try {
        // Verify teacher owns the lesson (or is admin)
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const upsertObj: Record<string, unknown> = {
          lesson_id,
          task_instructions: task_instructions ?? null,
          system_prompt: system_prompt ?? null,
        };

        const { data, error } = await supabase
          .from('lessons_ai_tasks')
          .upsert(upsertObj, { onConflict: 'lesson_id' })
          .select('*')
          .single();

        if (error) return errorResult(`Upserting lesson AI task: ${error.message}`);

        return {
          content: [
            {
              type: 'text',
              text: `AI task upserted for lesson ${lesson_id}.`,
            },
          ],
          structuredContent: data,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_reorder_lessons",
    {
      title: "Reorder Lessons",
      description: "Reorder lessons in a course by updating their sequence numbers.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
          lesson_orders: z
            .array(
              z.object({
                lesson_id: z.number().describe("Lesson ID"),
                sequence: z.number().int().describe("New sequence number"),
              })
            )
            .describe("Array of lesson IDs with their new sequence numbers"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id, lesson_orders }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const errors: string[] = [];
        for (const { lesson_id, sequence } of lesson_orders) {
          const { error } = await supabase
            .from("lessons")
            .update({ sequence })
            .eq("id", lesson_id)
            .eq("course_id", course_id);

          if (error) errors.push(`Lesson ${lesson_id}: ${error.message}`);
        }

        if (errors.length > 0) {
          return errorResult(`Reorder completed with errors:\n${errors.join("\n")}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully reordered ${lesson_orders.length} lessons in course ${course_id}.`,
            },
          ],
          structuredContent: {
            course_id,
            reordered_count: lesson_orders.length,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_publish_lesson",
    {
      title: "Publish Lesson",
      description: "Publish a lesson by setting its status to 'published'.",
      inputSchema: z.object({ lesson_id: z.number().describe("The lesson ID to publish") }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ lesson_id }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("lessons")
          .update({ status: "published" })
          .eq("id", lesson_id)
          .select("id, title, status")
          .single();

        if (error) return errorResult(`Publishing lesson: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Lesson published: **${data.title}** (ID: ${data.id})`,
            },
          ],
          structuredContent: {
            id: data.id,
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
    "lms_list_mdx_components",
    {
      title: "List MDX Components",
      description: "List available MDX components and example snippets you can use in lesson MDX content.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const components = [
          {
            name: "Callout",
            description: "A colored box for notes, warnings, or info.",
            snippet: '<Callout type="info">Mensaje informativo para estudiantes.</Callout>',
          },
          {
            name: "Spoiler",
            description: "Collapsible content used for solutions or extra info.",
            snippet: '<Spoiler label="Mostrar solución">Aquí va la solución ocultada.</Spoiler>',
          },
          {
            name: "Quiz",
            description: "Multiple choice question. Use JSON.parse for options.",
            snippet:
              '<Quiz question="¿Cuál es la capital de Francia?" options={JSON.parse(\'["Londres","París","Berlín"]\')} correctIndex={1} explanation="París es la capital." />',
          },
          {
            name: "Steps",
            description: "A numbered list of steps.",
            snippet: "<Steps><Step title=\"Paso 1\">Contenido...</Step></Steps>",
          },
          {
            name: "Vocabulary",
            description: "Word with translation and audio.",
            snippet: '<Vocabulary word="Hola" translation="Hello" audioUrl="/audio/hola.mp3" />',
          },
          {
            name: "Definition",
            description: "Term definition.",
            snippet: '<Definition term="API">Interfaz de programación.</Definition>',
          },
          {
            name: "Video",
            description: "Embedded video player.",
            snippet: '<Video url="https://www.youtube.com/watch?v=VIDEO_ID" />',
          },
        ];

        let result = "# Componentes MDX disponibles\n\n";
        for (const c of components) {
          result += `### ${c.name}\n${c.description}\n\`\`\`mdx\n${c.snippet}\n\`\`\`\n\n`;
        }

        return {
          content: [{ type: "text", text: result }],
          structuredContent: { components },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
