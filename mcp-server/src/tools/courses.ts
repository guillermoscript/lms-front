import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerCourseTools(server: McpServer, auth: AuthManager) {
  server.tool(
    "list_courses",
    "List courses owned by the authenticated teacher. Admins see all courses. Optionally filter by status.",
    {
      status: z.enum(["draft", "published", "archived"]).optional().describe("Filter by course status"),
    },
    async ({ status }) => {
      try {
        const supabase = auth.getClient();
        let query = supabase
          .from("courses")
          .select("course_id, title, description, status, tags, created_at, updated_at, lessons(count), enrollments(count)")
          .order("created_at", { ascending: false });

        if (!auth.isAdmin()) {
          query = query.eq("author_id", auth.getUserId());
        }
        if (status) {
          query = query.eq("status", status);
        }

        const { data, error } = await query;
        if (error) return textResult(`Error listing courses: ${error.message}`);
        if (!data || data.length === 0) return textResult("No courses found.");

        const lines = data.map((c) => {
          const lessonCount = (c.lessons as unknown as { count: number }[])?.[0]?.count ?? 0;
          const enrollCount = (c.enrollments as unknown as { count: number }[])?.[0]?.count ?? 0;
          return `- **${c.title}** (ID: ${c.course_id}) [${c.status}] — ${lessonCount} lessons, ${enrollCount} enrollments`;
        });

        return textResult(`Found ${data.length} course(s):\n\n${lines.join("\n")}`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "get_course",
    "Get detailed information about a course including its lessons, exams, and enrollment count.",
    {
      course_id: z.number().describe("The course ID"),
    },
    async ({ course_id }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("courses")
          .select(
            `course_id, title, description, status, tags, created_at, updated_at,
            lessons(id, title, sequence, status),
            exams(exam_id, title, exam_date, duration, status),
            enrollments(count)`
          )
          .eq("course_id", course_id)
          .order("sequence", { referencedTable: "lessons" })
          .single();

        if (error || !data) return textResult(`Course ${course_id} not found.`);

        const enrollCount = (data.enrollments as unknown as { count: number }[])?.[0]?.count ?? 0;

        let result = `# ${data.title} (ID: ${data.course_id})\n\n`;
        result += `**Status:** ${data.status}\n`;
        result += `**Description:** ${data.description ?? "None"}\n`;
        result += `**Tags:** ${data.tags ?? "None"}\n`;
        result += `**Enrollments:** ${enrollCount}\n`;
        result += `**Created:** ${data.created_at}\n\n`;

        const lessons = data.lessons as unknown as { id: number; title: string; sequence: number; status: string }[];
        if (lessons?.length > 0) {
          result += `## Lessons (${lessons.length})\n\n`;
          for (const l of lessons) {
            result += `${l.sequence}. **${l.title}** (ID: ${l.id}) [${l.status}]\n`;
          }
          result += "\n";
        } else {
          result += "## Lessons\nNo lessons yet.\n\n";
        }

        const exams = data.exams as unknown as { exam_id: number; title: string; exam_date: string; duration: number; status: string }[];
        if (exams?.length > 0) {
          result += `## Exams (${exams.length})\n\n`;
          for (const e of exams) {
            result += `- **${e.title}** (ID: ${e.exam_id}) [${e.status}] — ${e.duration} min, date: ${e.exam_date ?? "TBD"}\n`;
          }
        } else {
          result += "## Exams\nNo exams yet.\n";
        }

        return textResult(result);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "create_course",
    "Create a new course in draft status. The authenticated user becomes the author.",
    {
      title: z.string().describe("Course title"),
      description: z.string().optional().describe("Course description"),
      tags: z.string().optional().describe("Comma-separated tags"),
      category_id: z.number().optional().describe("Category ID"),
    },
    async ({ title, description, tags, category_id }) => {
      try {
        const supabase = auth.getClient();
        const { data, error } = await supabase
          .from("courses")
          .insert({
            title,
            description: description ?? null,
            tags: tags ? tags.split(",").map((t) => t.trim()) : null,
            category_id: category_id ?? null,
            author_id: auth.getUserId(),
            status: "draft",
          })
          .select("course_id, title, status")
          .single();

        if (error) return textResult(`Error creating course: ${error.message}`);

        return textResult(
          `Course created successfully!\n\n- **${data.title}** (ID: ${data.course_id}) [${data.status}]\n\nNext steps: Add lessons with \`create_lesson\` and exams with \`create_exam\`.`
        );
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "update_course",
    "Update course fields (title, description, tags, status).",
    {
      course_id: z.number().describe("The course ID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      tags: z.string().optional().describe("New tags (comma-separated)"),
      status: z.enum(["draft", "published", "archived"]).optional().describe("New status"),
    },
    async ({ course_id, title, description, tags, status }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (tags !== undefined) updateData.tags = tags ? tags.split(",").map((t) => t.trim()) : null;
        if (status !== undefined) updateData.status = status;

        if (Object.keys(updateData).length === 0) return textResult("No fields to update.");

        const { data, error } = await supabase
          .from("courses")
          .update(updateData)
          .eq("course_id", course_id)
          .select("course_id, title, status")
          .single();

        if (error) return textResult(`Error updating course: ${error.message}`);
        return textResult(`Course updated: **${data.title}** (ID: ${data.course_id}) [${data.status}]`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "publish_course",
    "Publish a course. Requires at least one published lesson. Sets status to 'published'.",
    {
      course_id: z.number().describe("The course ID to publish"),
    },
    async ({ course_id }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data: lessons, error: lessonError } = await supabase
          .from("lessons")
          .select("id")
          .eq("course_id", course_id)
          .eq("status", "published")
          .limit(1);

        if (lessonError) return textResult(`Error checking lessons: ${lessonError.message}`);
        if (!lessons || lessons.length === 0) {
          return textResult("Cannot publish: course needs at least one published lesson. Use `publish_lesson` first.");
        }

        const { data, error } = await supabase
          .from("courses")
          .update({ status: "published" })
          .eq("course_id", course_id)
          .select("course_id, title, status")
          .single();

        if (error) return textResult(`Error publishing course: ${error.message}`);
        return textResult(`Course published! **${data.title}** (ID: ${data.course_id}) is now live.`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );

  server.tool(
    "archive_course",
    "Archive a course. Sets status to 'archived'. Existing enrollments are preserved.",
    {
      course_id: z.number().describe("The course ID to archive"),
    },
    async ({ course_id }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("courses")
          .update({ status: "archived" })
          .eq("course_id", course_id)
          .select("course_id, title, status")
          .single();

        if (error) return textResult(`Error archiving course: ${error.message}`);
        return textResult(`Course archived: **${data.title}** (ID: ${data.course_id})`);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : err}`);
      }
    }
  );
}
