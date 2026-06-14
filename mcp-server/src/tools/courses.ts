import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, okText, errorResult, PaginationSchema } from "../format.js";

export function registerCourseTools(server: MCPServer) {
  // ── lms_list_courses ────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_courses",
      description:
        "List courses owned by the authenticated teacher. Admins see all courses. Supports filtering by status and pagination.",
      schema: z.object({
        limit: PaginationSchema.limit,
        offset: PaginationSchema.offset,
        status: z
          .enum(["draft", "published", "archived"])
          .optional()
          .describe("Filter by course status"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "course-dashboard",
        invoking: "Loading courses...",
        invoked: "Courses loaded",
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();
        const { status, limit, offset } = input;

        let query = supabase
          .from("courses")
          .select(
            "course_id, title, description, status, tags, created_at, updated_at, lessons(count), enrollments(count)",
            { count: "exact" }
          )
          .eq("tenant_id", session.getTenantId())
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (!session.isAdmin()) {
          query = query.eq("author_id", session.getUserId());
        }
        if (status) {
          query = query.eq("status", status);
        }

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing courses: ${error.message}`);

        const total = count ?? 0;

        if (!data || data.length === 0) {
          return widget({
            props: {
              status: status ?? "all",
              total: 0,
              courses: [],
            },
            output: text("No courses found."),
          });
        }

        const courses = data.map((c) => ({
          id: c.course_id,
          title: c.title,
          description: c.description,
          status: c.status,
          tags: c.tags,
          lesson_count: (c.lessons as any)?.[0]?.count ?? 0,
          enrollment_count: (c.enrollments as any)?.[0]?.count ?? 0,
          created_at: c.created_at,
          updated_at: c.updated_at,
        }));

        return widget({
          props: {
            status: status ?? "all",
            total,
            courses,
          },
          output: text(`Found ${total} course(s).`),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_course ──────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_course",
      description:
        "Get detailed information about a course including its lessons, exams, and enrollment count.",
      schema: z.object({
        course_id: z.number().describe("The course ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "course-detail",
        invoking: "Loading course...",
        invoked: "Course loaded",
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();

        const { data, error } = await supabase
          .from("courses")
          .select(
            `course_id, title, description, status, tags, require_sequential_completion, created_at, updated_at,
            lessons(id, title, sequence, status),
            exams(exam_id, title, exam_date, duration, status),
            enrollments(count)`
          )
          .eq("course_id", input.course_id)
          .order("sequence", { referencedTable: "lessons" })
          .single();

        if (error || !data) return errorResult(`Course ${input.course_id} not found.`);

        const enrollCount = (data.enrollments as any)?.[0]?.count ?? 0;
        const lessons = ((data.lessons as any[]) || []).map((l) => ({
          id: l.id,
          title: l.title,
          sequence: l.sequence,
          status: l.status,
        }));
        const exams = ((data.exams as any[]) || []).map((e) => ({
          id: e.exam_id,
          title: e.title,
          date: e.exam_date,
          duration: e.duration,
          status: e.status,
        }));

        const course = {
          id: data.course_id,
          title: data.title,
          description: data.description,
          status: data.status,
          tags: data.tags,
          require_sequential_completion: data.require_sequential_completion,
          enrollment_count: enrollCount,
          created_at: data.created_at,
        };

        return widget({
          props: { course, lessons, exams },
          output: text(
            `# ${data.title} (ID: ${data.course_id})\n\nStatus: ${data.status} | Enrollments: ${enrollCount} | Lessons: ${lessons.length} | Exams: ${exams.length}`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_create_course ───────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_create_course",
      description:
        "Create a new course in draft status. The authenticated user becomes the author.",
      schema: z.object({
        title: z.string().min(1).describe("Course title"),
        description: z.string().optional().describe("Course description"),
        tags: z.string().optional().describe("Comma-separated tags"),
        category_id: z.number().optional().describe("Category ID"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();
        const { data, error } = await supabase
          .from("courses")
          .insert({
            title: input.title,
            description: input.description ?? null,
            tags: input.tags ? input.tags.split(",").map((t) => t.trim()) : null,
            category_id: input.category_id ?? null,
            author_id: session.getUserId(),
            tenant_id: session.getTenantId(),
            status: "draft",
          })
          .select("course_id, title, status")
          .single();

        if (error) return errorResult(`Creating course: ${error.message}`);

        return ok(
          { id: data.course_id, title: data.title, status: data.status },
          `Course created successfully!\n\n- **${data.title}** (ID: ${data.course_id}) [${data.status}]\n\nNext steps: Add lessons with \`lms_create_lesson\` and exams with \`lms_create_exam\`.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_update_course ───────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_update_course",
      description:
        "Update course metadata such as title, description, tags, status, or sequential completion mode.",
      schema: z.object({
        course_id: z.number().describe("The course ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        tags: z.string().optional().describe("New tags (comma-separated)"),
        status: z
          .enum(["draft", "published", "archived"])
          .optional()
          .describe("New status"),
        require_sequential_completion: z
          .boolean()
          .optional()
          .describe("When true, students must complete lessons in order"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();

        const updateData: Record<string, unknown> = {};
        if (input.title !== undefined) updateData.title = input.title;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.tags !== undefined)
          updateData.tags = input.tags ? input.tags.split(",").map((t) => t.trim()) : null;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.require_sequential_completion !== undefined)
          updateData.require_sequential_completion = input.require_sequential_completion;

        if (Object.keys(updateData).length === 0) {
          return okText("No fields to update.");
        }

        const { data, error } = await supabase
          .from("courses")
          .update(updateData)
          .eq("course_id", input.course_id)
          .select("course_id, title, status")
          .single();

        if (error) return errorResult(`Updating course: ${error.message}`);

        return ok(
          { id: data.course_id, title: data.title, status: data.status },
          `Course updated: **${data.title}** (ID: ${data.course_id}) [${data.status}]`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_publish_course ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_publish_course",
      description: "Make a course live. Requires at least one published lesson.",
      schema: z.object({
        course_id: z.number().describe("The course ID to publish"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();

        const { data: lessons, error: lessonError } = await supabase
          .from("lessons")
          .select("id")
          .eq("course_id", input.course_id)
          .eq("status", "published")
          .limit(1);

        if (lessonError) return errorResult(`Checking lessons: ${lessonError.message}`);
        if (!lessons || lessons.length === 0) {
          return errorResult(
            "Cannot publish: course needs at least one published lesson. Use `lms_publish_lesson` first."
          );
        }

        const { data, error } = await supabase
          .from("courses")
          .update({ status: "published" })
          .eq("course_id", input.course_id)
          .select("course_id, title, status")
          .single();

        if (error) return errorResult(`Publishing course: ${error.message}`);

        return ok(
          { id: data.course_id, title: data.title, status: data.status },
          `Course published! **${data.title}** (ID: ${data.course_id}) is now live.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_archive_course ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_archive_course",
      description:
        "Archive a course. Sets status to 'archived'. Existing enrollments are preserved.",
      schema: z.object({
        course_id: z.number().describe("The course ID to archive"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();

        const { data, error } = await supabase
          .from("courses")
          .update({ status: "archived" })
          .eq("course_id", input.course_id)
          .select("course_id, title, status")
          .single();

        if (error) return errorResult(`Archiving course: ${error.message}`);

        return ok(
          { id: data.course_id, title: data.title, status: data.status },
          `Course archived: **${data.title}** (ID: ${data.course_id})`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
