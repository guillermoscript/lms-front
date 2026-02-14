import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerLessonTools(server: McpServer, auth: AuthManager) {
  server.tool(
    "list_lessons",
    "List all lessons in a course, ordered by sequence number.",
    { course_id: z.number().describe("The course ID") },
    async ({ course_id }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("lessons")
          .select("id, title, sequence, status, description, video_url, created_at")
          .eq("course_id", course_id)
          .order("sequence");

        if (error) return textResult(`Error listing lessons: ${error.message}`);
        if (!data || data.length === 0) return textResult("No lessons found for this course.");

        const lines = data.map(
          (l) => `${l.sequence}. **${l.title}** (ID: ${l.id}) [${l.status}]${l.video_url ? " [has video]" : ""}`
        );

        return textResult(`Lessons for course ${course_id}:\n\n${lines.join("\n")}`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "get_lesson",
    "Get full lesson details including MDX content.",
    { lesson_id: z.number().describe("The lesson ID") },
    async ({ lesson_id }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("lessons")
          .select("id, title, description, content, sequence, status, video_url, course_id, created_at, updated_at")
          .eq("id", lesson_id)
          .single();

        if (error || !data) return textResult(`Lesson ${lesson_id} not found.`);

        let result = `# ${data.title} (ID: ${data.id})\n\n`;
        result += `**Course ID:** ${data.course_id}\n`;
        result += `**Sequence:** ${data.sequence}\n`;
        result += `**Status:** ${data.status}\n`;
        result += `**Description:** ${data.description ?? "None"}\n`;
        result += `**Video URL:** ${data.video_url ?? "None"}\n\n`;
        result += `## Content\n\n${data.content ?? "(empty)"}`;

        return textResult(result);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "create_lesson",
    "Create a new lesson in a course.",
    {
      course_id: z.number().describe("The course ID"),
      title: z.string().describe("Lesson title"),
      content: z.string().optional().describe("MDX content for the lesson"),
      sequence: z.number().describe("Order position (1-based)"),
      description: z.string().optional().describe("Short description"),
      video_url: z.string().optional().describe("Video URL"),
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
            video_url: video_url ?? null,
            status: "draft",
          })
          .select("id, title, sequence, status")
          .single();

        if (error) return textResult(`Error creating lesson: ${error.message}`);

        return textResult(
          `Lesson created: **${data.title}** (ID: ${data.id}) at position ${data.sequence} [${data.status}]\n\nUse \`publish_lesson\` when ready to make it available.`
        );
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "update_lesson",
    "Update lesson fields (title, content, description, video_url, status).",
    {
      lesson_id: z.number().describe("The lesson ID"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New MDX content"),
      description: z.string().optional().describe("New description"),
      video_url: z.string().optional().describe("New video URL"),
      status: z.enum(["draft", "published"]).optional().describe("New status"),
    },
    async ({ lesson_id, title, content, description, video_url, status }) => {
      try {
        await auth.verifyLessonOwnership(lesson_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (description !== undefined) updateData.description = description;
        if (video_url !== undefined) updateData.video_url = video_url;
        if (status !== undefined) updateData.status = status;

        if (Object.keys(updateData).length === 0) return textResult("No fields to update.");

        const { data, error } = await supabase
          .from("lessons")
          .update(updateData)
          .eq("id", lesson_id)
          .select("id, title, status")
          .single();

        if (error) return textResult(`Error updating lesson: ${error.message}`);
        return textResult(`Lesson updated: **${data.title}** (ID: ${data.id}) [${data.status}]`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "reorder_lessons",
    "Reorder lessons in a course by updating their sequence numbers.",
    {
      course_id: z.number().describe("The course ID"),
      lesson_orders: z
        .array(
          z.object({
            lesson_id: z.number().describe("Lesson ID"),
            sequence: z.number().describe("New sequence number"),
          })
        )
        .describe("Array of lesson IDs with their new sequence numbers"),
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
          return textResult(`Reorder completed with errors:\n${errors.join("\n")}`);
        }

        return textResult(`Successfully reordered ${lesson_orders.length} lessons in course ${course_id}.`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "publish_lesson",
    "Publish a lesson by setting its status to 'published'.",
    { lesson_id: z.number().describe("The lesson ID to publish") },
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

        if (error) return textResult(`Error publishing lesson: ${error.message}`);
        return textResult(`Lesson published: **${data.title}** (ID: ${data.id})`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );
}
