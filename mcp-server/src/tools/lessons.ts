import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
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
      description: "Get full lesson details including MDX content, attached resources, and scheduling info.",
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

        const [{ data, error }, { data: resources }] = await Promise.all([
          supabase
            .from("lessons")
            .select("id, title, description, content, sequence, status, video_url, publish_at, course_id, created_at, updated_at")
            .eq("id", lesson_id)
            .single(),
          supabase
            .from("lesson_resources")
            .select("id, file_name, file_size, mime_type, display_order, created_at")
            .eq("lesson_id", lesson_id)
            .order("display_order", { ascending: true }),
        ]);

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
            publish_at: data.publish_at,
            course_id: data.course_id,
            created_at: data.created_at,
            updated_at: data.updated_at,
          },
          resources: (resources || []).map((r: any) => ({
            id: r.id,
            file_name: r.file_name,
            file_size: r.file_size,
            mime_type: r.mime_type,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          let result = `# ${data.title} (ID: ${data.id})\n\n`;
          result += `**Course ID:** ${data.course_id}\n`;
          result += `**Sequence:** ${data.sequence}\n`;
          result += `**Status:** ${data.status}\n`;
          if (data.publish_at) result += `**Scheduled Publish:** ${data.publish_at}\n`;
          result += `**Description:** ${data.description ?? "None"}\n`;
          result += `**Video URL:** ${data.video_url ?? "None"}\n\n`;
          if (output.resources.length > 0) {
            result += `## Resources (${output.resources.length})\n\n`;
            for (const r of output.resources) {
              const sizeKB = (r.file_size / 1024).toFixed(1);
              result += `- **${r.file_name}** (ID: ${r.id}) — ${sizeKB} KB, ${r.mime_type}\n`;
            }
            result += "\n";
          }
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
      description: "Create a new lesson in a course in draft status. Optionally schedule auto-publish with publish_at.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
          title: z.string().min(1).describe("Lesson title"),
          content: z.string().optional().describe("MDX content for the lesson"),
          sequence: z.number().int().describe("Order position (1-based)"),
          description: z.string().optional().describe("Short description"),
          video_url: z.string().url().optional().or(z.literal("")).describe("Video URL"),
          publish_at: z.string().optional().describe("ISO 8601 datetime to auto-publish the lesson (e.g. '2026-04-01T09:00:00Z'). Leave empty for manual publishing."),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ course_id, title, content, sequence, description, video_url, publish_at }) => {
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
            publish_at: publish_at || null,
            tenant_id: auth.getTenantId(),
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
      description: "Update lesson fields like title, content, description, status, or publish_at schedule.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
          title: z.string().optional().describe("New title"),
          content: z.string().optional().describe("New MDX content"),
          description: z.string().optional().describe("New description"),
          video_url: z.string().url().optional().or(z.literal("")).describe("New video URL"),
          status: z.enum(["draft", "published"]).optional().describe("New status"),
          publish_at: z.string().nullable().optional().describe("ISO 8601 datetime for auto-publish, or null to clear schedule"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ lesson_id, title, content, description, video_url, status, publish_at }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (description !== undefined) updateData.description = description;
        if (video_url !== undefined) updateData.video_url = video_url || null;
        if (status !== undefined) updateData.status = status;
        if (publish_at !== undefined) updateData.publish_at = publish_at;

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

  server.registerTool(
    "lms_delete_lesson",
    {
      title: "Delete Lesson",
      description:
        "Permanently delete a lesson and its associated AI task. This is irreversible. Student completion records for this lesson will also be removed.",
      inputSchema: z.object({ lesson_id: z.number().describe("The lesson ID to delete") }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ lesson_id }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const { data: lesson } = await supabase
          .from("lessons")
          .select("title")
          .eq("id", lesson_id)
          .single();

        const { error } = await supabase.from("lessons").delete().eq("id", lesson_id);
        if (error) return errorResult(`Deleting lesson: ${error.message}`);

        return {
          content: [{ type: "text", text: `Lesson "${lesson?.title ?? lesson_id}" (ID: ${lesson_id}) has been deleted.` }],
          structuredContent: { success: true, deleted_lesson_id: lesson_id },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_get_lesson_ai_task",
    {
      title: "Get Lesson AI Task",
      description: "Get the AI task (instructions and system prompt) configured for a lesson.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
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
          .from("lessons_ai_tasks")
          .select("id, lesson_id, task_instructions, system_prompt, created_at, updated_at")
          .eq("lesson_id", lesson_id)
          .maybeSingle();

        if (error) return errorResult(`Getting AI task: ${error.message}`);
        if (!data) {
          return { content: [{ type: "text", text: `No AI task configured for lesson ${lesson_id}.` }] };
        }

        return {
          content: [
            {
              type: "text",
              text: `# AI Task for Lesson ${lesson_id}\n\n**Task Instructions:**\n${data.task_instructions ?? "(not set)"}\n\n**System Prompt:**\n${data.system_prompt ?? "(not set)"}`,
            },
          ],
          structuredContent: data,
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
        if (!task_instructions && !system_prompt) {
          return errorResult("At least one of task_instructions or system_prompt must be provided.");
        }

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
          {
            name: "Audio",
            description: "Audio player with optional title.",
            snippet: '<Audio src="https://example.com/audio.mp3" title="Episode 1" />',
          },
          {
            name: "Embed",
            description: "Generic iframe embed for external content.",
            snippet: '<Embed url="https://example.com/interactive" title="Demo" caption="Interactive demo" />',
          },
          {
            name: "FileDownload",
            description: "Downloadable file attachment with description.",
            snippet: '<FileDownload url="https://example.com/guide.pdf" filename="guide.pdf" description="Course materials" />',
          },
          {
            name: "Glossary",
            description: "List of term/definition pairs. Uses JSON.parse for items.",
            snippet: '<Glossary items={JSON.parse(\'[{"term":"API","definition":"Application Programming Interface"},{"term":"REST","definition":"Representational State Transfer"}]\')} />',
          },
          {
            name: "Comparison",
            description: "Side-by-side comparison of two options with bullet points. Uses JSON.parse for sides.",
            snippet: '<Comparison sideA={JSON.parse(\'{"title":"Python","points":["Easy to learn","Great for data science"],"highlight":"positive"}\')} sideB={JSON.parse(\'{"title":"Java","points":["Strongly typed","Enterprise standard"],"highlight":"neutral"}\')} summary="Both are great languages for different use cases." />',
          },
          {
            name: "Table",
            description: "Data table with headers and rows. Uses JSON.parse for data.",
            snippet: '<Table headers={JSON.parse(\'["Concepto","Descripción","Ejemplo"]\')} rows={JSON.parse(\'[["Variable","Almacena un valor","let x = 5"],["Función","Bloque reutilizable","function sum(){}"]]\')} striped={true} />',
          },
          {
            name: "FlashcardSet",
            description: "Deck of flashcards with front/back for self-study. Uses JSON.parse.",
            snippet: '<FlashcardSet cards={JSON.parse(\'[{"front":"What is HTTP?","back":"HyperText Transfer Protocol"},{"front":"What is DNS?","back":"Domain Name System"}]\')} />',
          },
          {
            name: "FillInTheBlank",
            description: "Sentence with blank slots for self-check. Uses JSON.parse for segments.",
            snippet: '<FillInTheBlank segments={JSON.parse(\'[{"type":"text","value":"The capital of France is "},{"type":"blank","value":"Paris"},{"type":"text","value":"."}]\')} explanation="Paris has been the capital since the 10th century." />',
          },
          {
            name: "MatchingPairs",
            description: "Connect terms to their matches. Uses JSON.parse for pairs.",
            snippet: '<MatchingPairs pairs={JSON.parse(\'[{"term":"H2O","match":"Water"},{"term":"NaCl","match":"Salt"},{"term":"CO2","match":"Carbon Dioxide"}]\')} explanation="These are common chemical formulas." />',
          },
          {
            name: "Ordering",
            description: "Arrange items in the correct sequence. Uses JSON.parse for items (provide in correct order).",
            snippet: '<Ordering items={JSON.parse(\'["Define the problem","Research solutions","Implement","Test","Deploy"]\')} explanation="The software development lifecycle follows these steps." />',
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

  // ── Lesson Resource Tools ──────────────────────────────────────────

  server.registerTool(
    "lms_list_lesson_resources",
    {
      title: "List Lesson Resources",
      description: "List downloadable file resources attached to a lesson.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
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
          .from("lesson_resources")
          .select("id, file_name, file_size, mime_type, display_order, created_at")
          .eq("lesson_id", lesson_id)
          .order("display_order", { ascending: true });

        if (error) return errorResult(`Listing resources: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: `No resources attached to lesson ${lesson_id}.` }] };
        }

        const output = {
          lesson_id,
          count: data.length,
          resources: data.map((r) => ({
            id: r.id,
            file_name: r.file_name,
            file_size: r.file_size,
            mime_type: r.mime_type,
            display_order: r.display_order,
          })),
        };

        const lines = [`# Resources for lesson ${lesson_id}`, `${data.length} file(s)`, ""];
        for (const r of output.resources) {
          const sizeKB = (r.file_size / 1024).toFixed(1);
          lines.push(`${r.display_order + 1}. **${r.file_name}** (ID: ${r.id}) — ${sizeKB} KB, ${r.mime_type}`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_upload_lesson_resource",
    {
      title: "Upload Lesson Resource",
      description:
        "Upload a file resource to a lesson. The file content must be provided as a base64-encoded string. Max 10MB. Supported types: PDF, Word, Excel, CSV, images (JPEG, PNG, GIF, WebP).",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
          file_name: z.string().min(1).describe("Original file name with extension (e.g. 'worksheet.pdf')"),
          file_content_base64: z.string().min(1).describe("Base64-encoded file content"),
          mime_type: z
            .enum([
              "application/pdf",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/vnd.ms-excel",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "text/csv",
              "image/jpeg",
              "image/png",
              "image/gif",
              "image/webp",
            ])
            .describe("MIME type of the file"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ lesson_id, file_name, file_content_base64, mime_type }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();
        const tenantId = auth.getTenantId();

        // Decode base64 to buffer
        const buffer = Buffer.from(file_content_base64, "base64");
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (buffer.length > MAX_SIZE) {
          return errorResult(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Maximum is 10MB.`);
        }

        const ext = file_name.split(".").pop()?.toLowerCase() || "bin";
        const storagePath = `${tenantId}/${lesson_id}/${nanoid()}.${ext}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("lesson-resources")
          .upload(storagePath, buffer, {
            contentType: mime_type,
            upsert: false,
          });

        if (uploadError) return errorResult(`Upload failed: ${uploadError.message}`);

        // Get current max display_order
        const { data: existing } = await supabase
          .from("lesson_resources")
          .select("display_order")
          .eq("lesson_id", lesson_id)
          .eq("tenant_id", tenantId)
          .order("display_order", { ascending: false })
          .limit(1);

        const nextOrder = (existing?.[0]?.display_order ?? -1) + 1;

        // Insert DB record
        const { data, error } = await supabase
          .from("lesson_resources")
          .insert({
            lesson_id,
            tenant_id: tenantId,
            file_name,
            file_path: storagePath,
            file_size: buffer.length,
            mime_type,
            uploaded_by: auth.getUserId(),
            display_order: nextOrder,
          })
          .select("id, file_name, file_size, mime_type")
          .single();

        if (error) return errorResult(`Saving resource record: ${error.message}`);

        return {
          content: [
            {
              type: "text",
              text: `Resource uploaded: **${data.file_name}** (ID: ${data.id}) — ${(data.file_size / 1024).toFixed(1)} KB`,
            },
          ],
          structuredContent: {
            id: data.id,
            file_name: data.file_name,
            file_size: data.file_size,
            mime_type: data.mime_type,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_delete_lesson_resource",
    {
      title: "Delete Lesson Resource",
      description: "Delete a file resource from a lesson. Removes both the file from storage and the database record.",
      inputSchema: z
        .object({
          resource_id: z.number().describe("The resource ID to delete"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ resource_id }) => {
      try {
        const supabase = auth.getClient();
        const tenantId = auth.getTenantId();

        // Fetch resource and verify ownership
        const { data: resource, error: fetchError } = await supabase
          .from("lesson_resources")
          .select("id, file_name, file_path, lesson_id, tenant_id")
          .eq("id", resource_id)
          .single();

        if (fetchError || !resource) return errorResult(`Resource ${resource_id} not found.`);
        if (resource.tenant_id !== tenantId) return errorResult("Access denied: resource belongs to a different tenant.");

        // Verify lesson ownership
        await auth.verifyLessonOwnership(resource.lesson_id);

        // Remove from storage
        await supabase.storage.from("lesson-resources").remove([resource.file_path]);

        // Remove from DB
        const { error } = await supabase
          .from("lesson_resources")
          .delete()
          .eq("id", resource_id);

        if (error) return errorResult(`Deleting resource: ${error.message}`);

        return {
          content: [
            { type: "text", text: `Resource deleted: **${resource.file_name}** (ID: ${resource_id})` },
          ],
          structuredContent: { success: true, deleted_resource_id: resource_id },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_reorder_lesson_resources",
    {
      title: "Reorder Lesson Resources",
      description: "Reorder the downloadable resources attached to a lesson.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
          resource_ids: z
            .array(z.number())
            .describe("Resource IDs in the desired display order"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ lesson_id, resource_ids }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const errors: string[] = [];
        for (let i = 0; i < resource_ids.length; i++) {
          const { error } = await supabase
            .from("lesson_resources")
            .update({ display_order: i })
            .eq("id", resource_ids[i])
            .eq("lesson_id", lesson_id);

          if (error) errors.push(`Resource ${resource_ids[i]}: ${error.message}`);
        }

        if (errors.length > 0) {
          return errorResult(`Reorder completed with errors:\n${errors.join("\n")}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully reordered ${resource_ids.length} resources for lesson ${lesson_id}.`,
            },
          ],
          structuredContent: { lesson_id, reordered_count: resource_ids.length },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_schedule_lesson",
    {
      title: "Schedule Lesson Publish",
      description: "Schedule a draft lesson to be auto-published at a specific date/time. The cron job runs every 5 minutes.",
      inputSchema: z
        .object({
          lesson_id: z.number().describe("The lesson ID"),
          publish_at: z
            .string()
            .nullable()
            .describe("ISO 8601 datetime for auto-publish (e.g. '2026-04-01T09:00:00Z'), or null to clear the schedule"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ lesson_id, publish_at }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("lessons")
          .update({ publish_at: publish_at })
          .eq("id", lesson_id)
          .select("id, title, status, publish_at")
          .single();

        if (error) return errorResult(`Scheduling lesson: ${error.message}`);

        const action = publish_at ? `scheduled for ${publish_at}` : "schedule cleared";
        return {
          content: [
            {
              type: "text",
              text: `Lesson **${data.title}** (ID: ${data.id}) — ${action}`,
            },
          ],
          structuredContent: {
            id: data.id,
            title: data.title,
            status: data.status,
            publish_at: data.publish_at,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
