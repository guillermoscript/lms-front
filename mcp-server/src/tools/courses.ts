import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";

/**
 * Common response format enum
 */
enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/**
 * Standard pagination schema
 */
const PaginationSchema = {
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum results to return"),
  offset: z.number().int().min(0).default(0).describe("Number of results to skip for pagination"),
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
};

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function registerCourseTools(server: McpServer, auth: AuthManager) {
  server.registerTool(
    "lms_list_courses",
    {
      title: "List Courses",
      description:
        "List courses owned by the authenticated teacher. Admins see all courses. Supports filtering by status and pagination.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          status: z.enum(["draft", "published", "archived"]).optional().describe("Filter by course status"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ status, limit, offset, response_format }) => {
      try {
        const supabase = auth.getClient();
        let query = supabase
          .from("courses")
          .select(
            "course_id, title, description, status, tags, created_at, updated_at, lessons(count), enrollments(count)",
            { count: "exact" }
          )
          .eq("tenant_id", auth.getTenantId())
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (!auth.isAdmin()) {
          query = query.eq("author_id", auth.getUserId());
        }
        if (status) {
          query = query.eq("status", status);
        }

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing courses: ${error.message}`);
        if (!data || data.length === 0) {
          return { content: [{ type: "text", text: "No courses found." }] };
        }

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset: total > offset + data.length ? offset + data.length : undefined,
          courses: data.map((c) => ({
            id: c.course_id,
            title: c.title,
            description: c.description,
            status: c.status,
            tags: c.tags,
            lesson_count: (c.lessons as any)?.[0]?.count ?? 0,
            enrollment_count: (c.enrollments as any)?.[0]?.count ?? 0,
            created_at: c.created_at,
            updated_at: c.updated_at,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Course List (${status || "all"})`,
            `Found ${total} course(s), showing ${data.length}`,
            "",
          ];
          for (const c of output.courses) {
            lines.push(
              `- **${c.title}** (ID: ${c.id}) [${c.status}] — ${c.lesson_count} lessons, ${c.enrollment_count} enrollments`
            );
          }
          if (output.has_more) {
            lines.push("", `*More courses available. Use offset=${output.next_offset} to see more.*`);
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
    "lms_get_course",
    {
      title: "Get Course Details",
      description: "Get detailed information about a course including its lessons, exams, and enrollment count.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
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
    async ({ course_id, response_format }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const { data, error } = await supabase
          .from("courses")
          .select(
            `course_id, title, description, status, tags, require_sequential_completion, created_at, updated_at,
            lessons(id, title, sequence, status),
            exams(exam_id, title, exam_date, duration, status),
            enrollments(count)`
          )
          .eq("course_id", course_id)
          .order("sequence", { referencedTable: "lessons" })
          .single();

        if (error || !data) return errorResult(`Course ${course_id} not found.`);

        const enrollCount = (data.enrollments as any)?.[0]?.count ?? 0;
        const lessons = (data.lessons as any[]) || [];
        const exams = (data.exams as any[]) || [];

        const output = {
          course: {
            id: data.course_id,
            title: data.title,
            description: data.description,
            status: data.status,
            tags: data.tags,
            require_sequential_completion: data.require_sequential_completion,
            enrollment_count: enrollCount,
            created_at: data.created_at,
            updated_at: data.updated_at,
          },
          lessons: lessons.map((l) => ({
            id: l.id,
            title: l.title,
            sequence: l.sequence,
            status: l.status,
          })),
          exams: exams.map((e) => ({
            id: e.exam_id,
            title: e.title,
            date: e.exam_date,
            duration: e.duration,
            status: e.status,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          let result = `# ${data.title} (ID: ${data.course_id})\n\n`;
          result += `**Status:** ${data.status}\n`;
          result += `**Description:** ${data.description ?? "None"}\n`;
          result += `**Tags:** ${data.tags ?? "None"}\n`;
          result += `**Sequential Completion:** ${data.require_sequential_completion ? "Yes" : "No"}\n`;
          result += `**Enrollments:** ${enrollCount}\n`;
          result += `**Created:** ${data.created_at}\n\n`;

          if (lessons.length > 0) {
            result += `## Lessons (${lessons.length})\n\n`;
            for (const l of output.lessons) {
              result += `${l.sequence}. **${l.title}** (ID: ${l.id}) [${l.status}]\n`;
            }
            result += "\n";
          } else {
            result += "## Lessons\nNo lessons yet.\n\n";
          }

          if (exams.length > 0) {
            result += `## Exams (${exams.length})\n\n`;
            for (const e of output.exams) {
              result += `- **${e.title}** (ID: ${e.id}) [${e.status}] — ${e.duration} min, date: ${e.date ?? "TBD"}\n`;
            }
          } else {
            result += "## Exams\nNo exams yet.\n";
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
    "lms_create_course",
    {
      title: "Create Course",
      description: "Create a new course in draft status. The authenticated user becomes the author.",
      inputSchema: z
        .object({
          title: z.string().min(1).describe("Course title"),
          description: z.string().optional().describe("Course description"),
          tags: z.string().optional().describe("Comma-separated tags"),
          category_id: z.number().optional().describe("Category ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
            tenant_id: auth.getTenantId(),
            status: "draft",
          })
          .select("course_id, title, status")
          .single();

        if (error) return errorResult(`Creating course: ${error.message}`);

        const output = {
          id: data.course_id,
          title: data.title,
          status: data.status,
        };

        return {
          content: [
            {
              type: "text",
              text: `Course created successfully!\n\n- **${data.title}** (ID: ${data.course_id}) [${data.status}]\n\nNext steps: Add lessons with \`lms_create_lesson\` and exams with \`lms_create_exam\`.`,
            },
          ],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "lms_update_course",
    {
      title: "Update Course",
      description: "Update course metadata such as title, description, tags, status, or sequential completion mode.",
      inputSchema: z
        .object({
          course_id: z.number().describe("The course ID"),
          title: z.string().optional().describe("New title"),
          description: z.string().optional().describe("New description"),
          tags: z.string().optional().describe("New tags (comma-separated)"),
          status: z.enum(["draft", "published", "archived"]).optional().describe("New status"),
          require_sequential_completion: z.boolean().optional().describe("When true, students must complete lessons in order"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id, title, description, tags, status, require_sequential_completion }) => {
      try {
        await auth.verifyCourseOwnership(course_id);
        const supabase = auth.getClient();

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (tags !== undefined) updateData.tags = tags ? tags.split(",").map((t) => t.trim()) : null;
        if (status !== undefined) updateData.status = status;
        if (require_sequential_completion !== undefined) updateData.require_sequential_completion = require_sequential_completion;

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: "text", text: "No fields to update." }] };
        }

        const { data, error } = await supabase
          .from("courses")
          .update(updateData)
          .eq("course_id", course_id)
          .select("course_id, title, status")
          .single();

        if (error) return errorResult(`Updating course: ${error.message}`);

        return {
          content: [
            {
              type: "text",
              text: `Course updated: **${data.title}** (ID: ${data.course_id}) [${data.status}]`,
            },
          ],
          structuredContent: {
            id: data.course_id,
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
    "lms_publish_course",
    {
      title: "Publish Course",
      description: "Make a course live. Requires at least one published lesson.",
      inputSchema: z.object({ course_id: z.number().describe("The course ID to publish") }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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

        if (lessonError) return errorResult(`Checking lessons: ${lessonError.message}`);
        if (!lessons || lessons.length === 0) {
          return errorResult("Cannot publish: course needs at least one published lesson. Use `lms_publish_lesson` first.");
        }

        const { data, error } = await supabase
          .from("courses")
          .update({ status: "published" })
          .eq("course_id", course_id)
          .select("course_id, title, status")
          .single();

        if (error) return errorResult(`Publishing course: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Course published! **${data.title}** (ID: ${data.course_id}) is now live.`,
            },
          ],
          structuredContent: {
            id: data.course_id,
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
    "lms_archive_course",
    {
      title: "Archive Course",
      description: "Archive a course. Sets status to 'archived'. Existing enrollments are preserved.",
      inputSchema: z.object({ course_id: z.number().describe("The course ID to archive") }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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

        if (error) return errorResult(`Archiving course: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Course archived: **${data.title}** (ID: ${data.course_id})`,
            },
          ],
          structuredContent: {
            id: data.course_id,
            title: data.title,
            status: data.status,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
