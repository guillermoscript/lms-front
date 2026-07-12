import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult, PaginationSchema } from "../format.js";

/**
 * Student-facing tools. Every tool is self-scoped: it reads (or, for
 * lms_complete_lesson, writes) only the caller's own rows. RLS enforces this
 * at the database level; the explicit user/tenant filters are for clarity and
 * performance, mirroring the app's own query patterns.
 *
 * Teachers and admins may call these too — "my" resolves to the caller.
 */

interface LessonRow {
  id: number;
  title: string;
  sequence: number;
  status: string;
}

/**
 * Load a lesson plus the learner-context needed by lms_view_lesson and
 * lms_complete_lesson: enrollment check, completion flag, and the
 * sequential-completion lock the app enforces on lesson pages.
 */
async function loadLessonForLearner(session: LmsSession, lessonId: number) {
  const supabase = session.getClient();

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select(
      "id, course_id, title, description, summary, content, video_url, embed_code, sequence, status, courses(title, require_sequential_completion)"
    )
    .eq("id", lessonId)
    .eq("tenant_id", session.getTenantId())
    .maybeSingle();

  if (error) throw new Error(`Loading lesson: ${error.message}`);
  if (!lesson) throw new Error(`Lesson ${lessonId} not found`);

  const isStudent = session.getRole() === "student";
  if (isStudent && lesson.status !== "published") {
    throw new Error(`Lesson ${lessonId} is not published`);
  }

  await session.verifyCourseAccess(lesson.course_id);

  const course = lesson.courses as unknown as {
    title: string;
    require_sequential_completion: boolean | null;
  } | null;

  // All published lessons in the course + my completions, to compute the
  // completed flag and the sequential lock in one pass.
  const { data: courseLessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, title, sequence, status")
    .eq("course_id", lesson.course_id)
    .eq("status", "published")
    .order("sequence", { ascending: true });
  if (lessonsError) throw new Error(`Loading course lessons: ${lessonsError.message}`);

  const lessonIds = (courseLessons ?? []).map((l: LessonRow) => l.id);
  let completedIds = new Set<number>();
  if (lessonIds.length > 0) {
    // lesson_completions keys on user_id and has NO tenant_id column.
    const { data: completions, error: completionsError } = await supabase
      .from("lesson_completions")
      .select("lesson_id")
      .eq("user_id", session.getUserId())
      .in("lesson_id", lessonIds);
    if (completionsError)
      throw new Error(`Loading completions: ${completionsError.message}`);
    completedIds = new Set((completions ?? []).map((c) => c.lesson_id as number));
  }

  const previous = (courseLessons ?? [])
    .filter((l: LessonRow) => l.sequence < lesson.sequence)
    .pop() as LessonRow | undefined;

  const locked =
    isStudent &&
    course?.require_sequential_completion === true &&
    previous !== undefined &&
    !completedIds.has(previous.id);

  return {
    lesson,
    courseTitle: course?.title ?? "",
    completed: completedIds.has(lesson.id),
    locked,
    previous,
  };
}

export function registerStudentTools(server: MCPServer) {
  // ── lms_my_learning ─────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_my_learning",
      description:
        "Show the caller's enrolled courses with per-course progress (lessons completed vs total) and the next lesson to take. The student learning dashboard.",
      schema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "my-learning",
        invoking: "Loading your courses...",
        invoked: "Learning dashboard ready",
      },
    },
    async (_input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();
        const userId = session.getUserId();

        // Canonical nested pattern from @lms/core getEnrolledCoursesWithProgress:
        // the embedded filter scopes lesson_completions to this user — without
        // it, every user's completions would inflate the counts.
        const { data, error } = await supabase
          .from("enrollments")
          .select(
            "enrollment_id, enrollment_date, course:courses(course_id, title, description, thumbnail_url, status, lessons(id, title, sequence, status, lesson_completions(user_id)))"
          )
          .eq("user_id", userId)
          .eq("tenant_id", session.getTenantId())
          .eq("status", "active")
          .eq("course.lessons.lesson_completions.user_id", userId)
          .order("enrollment_date", { ascending: false })
          .limit(50);

        if (error) return errorResult(`Loading enrollments: ${error.message}`);

        const courses = (data ?? [])
          .map((row) => {
            const course = row.course as unknown as {
              course_id: number;
              title: string;
              description: string | null;
              thumbnail_url: string | null;
              status: string;
              lessons: Array<{
                id: number;
                title: string;
                sequence: number;
                status: string;
                lesson_completions: Array<{ user_id: string }>;
              }>;
            } | null;
            if (!course) return null;

            const published = (course.lessons ?? [])
              .filter((l) => l.status === "published")
              .sort((a, b) => a.sequence - b.sequence);
            const completed = published.filter(
              (l) => (l.lesson_completions ?? []).length > 0
            );
            const next = published.find(
              (l) => (l.lesson_completions ?? []).length === 0
            );

            return {
              id: course.course_id,
              title: course.title,
              description: course.description,
              thumbnail_url: course.thumbnail_url,
              enrolled_at: row.enrollment_date as string,
              lessons_total: published.length,
              lessons_completed: completed.length,
              progress:
                published.length > 0
                  ? Math.round((completed.length / published.length) * 100)
                  : 0,
              next_lesson: next
                ? { id: next.id, title: next.title, sequence: next.sequence }
                : null,
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        const avg =
          courses.length > 0
            ? Math.round(
                courses.reduce((sum, c) => sum + c.progress, 0) / courses.length
              )
            : 0;

        return widget({
          props: { total: courses.length, average_progress: avg, courses },
          output: text(
            courses.length === 0
              ? "You are not enrolled in any courses yet. Use lms_browse_catalog to find courses."
              : `Enrolled in ${courses.length} course(s), average progress ${avg}%.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_view_lesson ─────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_view_lesson",
      description:
        "Read a lesson from a course the caller is enrolled in: content, video, and completion status. Respects sequential-completion locks. Students can only view published lessons of enrolled courses.",
      schema: z.object({
        lesson_id: z.number().describe("The lesson ID to view"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "lesson-viewer",
        invoking: "Opening lesson...",
        invoked: "Lesson ready",
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
        const { lesson, courseTitle, completed, locked, previous } =
          await loadLessonForLearner(session, input.lesson_id);

        return widget({
          props: {
            lesson: {
              id: lesson.id,
              course_id: lesson.course_id,
              title: lesson.title,
              description: lesson.description,
              summary: lesson.summary,
              // Never ship content for a locked lesson — the lock would be
              // decorative if the payload still contained the body.
              content: locked ? null : lesson.content,
              video_url: locked ? null : lesson.video_url,
              embed_code: locked ? null : lesson.embed_code,
              sequence: lesson.sequence,
            },
            course_title: courseTitle,
            completed,
            locked,
            locked_by: locked && previous
              ? { id: previous.id, title: previous.title }
              : null,
          },
          output: text(
            locked
              ? `Lesson "${lesson.title}" is locked: complete "${previous?.title}" first (this course requires sequential completion).`
              : `Lesson "${lesson.title}" (${courseTitle})${completed ? " — already completed." : "."}`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_complete_lesson ─────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_complete_lesson",
      description:
        "Mark a lesson as completed for the caller. Idempotent — completing an already-completed lesson is a no-op. Requires enrollment in the lesson's course and respects sequential-completion locks. XP and achievements are awarded by the platform automatically.",
      schema: z.object({
        lesson_id: z.number().describe("The lesson ID to mark complete"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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
        const { lesson, courseTitle, completed, locked, previous } =
          await loadLessonForLearner(session, input.lesson_id);

        if (locked) {
          return errorResult(
            `Lesson "${lesson.title}" is locked: complete "${previous?.title}" first (this course requires sequential completion).`
          );
        }
        if (completed) {
          return ok(
            { lesson_id: lesson.id, completed: true, already_completed: true },
            `Lesson "${lesson.title}" was already completed — nothing to do.`
          );
        }

        // Same write the app performs (lesson-navigation.tsx): two columns,
        // completed_at defaults server-side. lesson_completions has NO tenant_id.
        const { error } = await session
          .getClient()
          .from("lesson_completions")
          .insert({ lesson_id: lesson.id, user_id: session.getUserId() });
        if (error) return errorResult(`Marking lesson complete: ${error.message}`);

        return ok(
          { lesson_id: lesson.id, completed: true, already_completed: false },
          `Marked "${lesson.title}" (${courseTitle}) as completed. XP and achievements are awarded automatically.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_my_exam_results ─────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_my_exam_results",
      description:
        "List the caller's own exam submissions with scores, review status, and feedback, newest first.",
      schema: z.object({
        limit: PaginationSchema.limit,
        offset: PaginationSchema.offset,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "my-exam-results",
        invoking: "Loading your exam results...",
        invoked: "Exam results ready",
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
        // exam_submissions keys on student_id (not user_id) and orders by
        // submission_date (not submitted_at).
        const { data, error, count } = await session
          .getClient()
          .from("exam_submissions")
          .select(
            "submission_id, exam_id, score, feedback, review_status, submission_date, exams(title, course_id, courses(title))",
            { count: "exact" }
          )
          .eq("student_id", session.getUserId())
          .eq("tenant_id", session.getTenantId())
          .order("submission_date", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);

        if (error) return errorResult(`Loading exam results: ${error.message}`);

        const results = (data ?? []).map((s) => {
          const exam = s.exams as unknown as {
            title: string;
            courses: { title: string } | null;
          } | null;
          return {
            submission_id: s.submission_id,
            exam_id: s.exam_id,
            exam_title: exam?.title ?? `Exam ${s.exam_id}`,
            course_title: exam?.courses?.title ?? null,
            score: s.score !== null ? Number(s.score) : null,
            feedback: s.feedback,
            review_status: s.review_status,
            submitted_at: s.submission_date,
          };
        });

        const graded = results.filter((r) => r.score !== null);
        const avg =
          graded.length > 0
            ? Math.round(
                graded.reduce((sum, r) => sum + (r.score ?? 0), 0) / graded.length
              )
            : null;

        return widget({
          props: { total: count ?? results.length, average_score: avg, results },
          output: text(
            results.length === 0
              ? "You have no exam submissions yet."
              : `Found ${count ?? results.length} exam submission(s)${avg !== null ? `, average score ${avg}` : ""}.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_my_gamification ─────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_my_gamification",
      description:
        "Show the caller's gamification profile: XP, level, streaks, coin balance, leaderboard rank, and earned achievements.",
      schema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "gamification-profile",
        invoking: "Loading your progress...",
        invoked: "Profile ready",
      },
    },
    async (_input, ctx) => {
      let session: LmsSession;
      try {
        session = LmsSession.fromContext(ctx);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        const supabase = session.getClient();
        const userId = session.getUserId();
        const tenantId = session.getTenantId();

        const [{ data: profile, error: profileError }, { data: levels }] =
          await Promise.all([
            supabase
              .from("gamification_profiles")
              .select(
                "total_xp, level, current_streak, longest_streak, total_coins_spent, last_activity_date"
              )
              .eq("user_id", userId)
              .eq("tenant_id", tenantId)
              .maybeSingle(),
            supabase
              .from("gamification_levels")
              .select("level, min_xp, title, icon")
              .order("level", { ascending: true }),
          ]);
        if (profileError)
          return errorResult(`Loading profile: ${profileError.message}`);

        if (!profile) {
          return widget({
            props: {
              has_profile: false,
              total_xp: 0,
              level: 1,
              level_title: null,
              level_icon: null,
              next_level: null,
              xp_into_level: 0,
              xp_needed: null,
              coins: 0,
              current_streak: 0,
              longest_streak: 0,
              rank: null,
              participants: 0,
              achievements: [],
            },
            output: text(
              "No gamification activity yet — complete a lesson to start earning XP."
            ),
          });
        }

        const [{ data: earned, error: earnedError }, rankRes, participantsRes] =
          await Promise.all([
            supabase
              .from("gamification_user_achievements")
              .select(
                "earned_at, achievement:gamification_achievements(slug, title, description, tier, icon, xp_reward)"
              )
              .eq("user_id", userId)
              .eq("tenant_id", tenantId)
              .order("earned_at", { ascending: false }),
            supabase
              .from("gamification_profiles")
              .select("user_id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .gt("total_xp", profile.total_xp),
            supabase
              .from("gamification_profiles")
              .select("user_id", { count: "exact", head: true })
              .eq("tenant_id", tenantId),
          ]);
        if (earnedError)
          return errorResult(`Loading achievements: ${earnedError.message}`);

        const allLevels = levels ?? [];
        const current = allLevels.find((l) => l.level === profile.level);
        const next = allLevels.find((l) => l.level === profile.level + 1);
        const currentMin = current?.min_xp ?? 0;
        // Balance formula from get-gamification-summary: no coins column exists.
        const coins =
          Math.floor(profile.total_xp / 10) - (profile.total_coins_spent ?? 0);

        const achievements = (earned ?? []).map((row) => {
          const a = row.achievement as unknown as {
            slug: string;
            title: string;
            description: string | null;
            tier: string | null;
            icon: string | null;
            xp_reward: number | null;
          } | null;
          return {
            slug: a?.slug ?? "unknown",
            title: a?.title ?? "Achievement",
            description: a?.description ?? null,
            tier: a?.tier ?? null,
            icon: a?.icon ?? null,
            xp_reward: a?.xp_reward ?? null,
            earned_at: row.earned_at as string,
          };
        });

        const rank = (rankRes.count ?? 0) + 1;
        const participants = participantsRes.count ?? 0;

        return widget({
          props: {
            has_profile: true,
            total_xp: profile.total_xp,
            level: profile.level,
            level_title: current?.title ?? null,
            level_icon: current?.icon ?? null,
            next_level: next ? { level: next.level, min_xp: next.min_xp } : null,
            xp_into_level: profile.total_xp - currentMin,
            xp_needed: next ? next.min_xp - profile.total_xp : null,
            coins,
            current_streak: profile.current_streak ?? 0,
            longest_streak: profile.longest_streak ?? 0,
            rank,
            participants,
            achievements,
          },
          output: text(
            `Level ${profile.level}${current?.title ? ` (${current.title})` : ""}, ${profile.total_xp} XP, ${coins} coins, rank ${rank}/${participants}, ${achievements.length} achievement(s).`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_browse_catalog ──────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_browse_catalog",
      description:
        "Browse the school's published course catalog. Each course reports `enrolled` (explicitly enrolled — appears in lms_my_learning), `has_access` (entitled to view content), and `covered_by_plan` (an active subscription covers it — use lms_enroll_in_course to enroll). Purchases happen in the app.",
      schema: z.object({
        limit: PaginationSchema.limit,
        offset: PaginationSchema.offset,
        search: z
          .string()
          .optional()
          .describe("Filter courses by title/description substring"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      widget: {
        name: "course-catalog",
        invoking: "Browsing catalog...",
        invoked: "Catalog ready",
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
        const userId = session.getUserId();
        const tenantId = session.getTenantId();
        const nowIso = new Date().toISOString();

        let coursesQuery = supabase
          .from("courses")
          .select(
            "course_id, title, description, thumbnail_url, tags, created_at, lessons(count)",
            { count: "exact" }
          )
          .eq("tenant_id", tenantId)
          .eq("status", "published")
          .order("title", { ascending: true })
          .range(input.offset, input.offset + input.limit - 1);

        if (input.search) {
          // Strip PostgREST or-filter metacharacters, like getPublishedCourses.
          const term = input.search.replace(/[%_\\,()]/g, "").trim();
          if (term) {
            coursesQuery = coursesQuery.or(
              `title.ilike.%${term}%,description.ilike.%${term}%`
            );
          }
        }

        const [coursesRes, entitlementsRes, enrollmentsRes, subsRes] = await Promise.all([
          coursesQuery,
          // entitlements is the access source of truth (course-access.ts).
          supabase
            .from("entitlements")
            .select("course_id, expires_at")
            .eq("user_id", userId)
            .eq("status", "active"),
          // enrollments is what lms_my_learning lists — access ≠ enrolled (#366).
          supabase
            .from("enrollments")
            .select("course_id")
            .eq("user_id", userId)
            .eq("tenant_id", tenantId)
            .eq("status", "active"),
          supabase
            .from("subscriptions")
            .select("subscription_id, plan_id, end_date")
            .eq("user_id", userId)
            .eq("tenant_id", tenantId)
            .eq("subscription_status", "active")
            .gte("end_date", nowIso),
        ]);

        if (coursesRes.error)
          return errorResult(`Loading catalog: ${coursesRes.error.message}`);

        const accessible = new Set(
          (entitlementsRes.data ?? [])
            .filter((e) => !e.expires_at || e.expires_at > nowIso)
            .map((e) => e.course_id as number)
        );

        const enrolledSet = new Set(
          (enrollmentsRes.data ?? []).map((e) => e.course_id as number)
        );

        const planIds = (subsRes.data ?? []).map((s) => s.plan_id as number);
        let planCovered = new Set<number>();
        if (planIds.length > 0) {
          const { data: planCourses } = await supabase
            .from("plan_courses")
            .select("course_id")
            .in("plan_id", planIds);
          planCovered = new Set(
            (planCourses ?? []).map((pc) => pc.course_id as number)
          );
        }

        const courses = (coursesRes.data ?? []).map((c) => ({
          id: c.course_id,
          title: c.title,
          description: c.description,
          thumbnail_url: c.thumbnail_url,
          tags: c.tags,
          lesson_count: (c.lessons as unknown as Array<{ count: number }>)?.[0]?.count ?? 0,
          enrolled: enrolledSet.has(c.course_id),
          has_access: accessible.has(c.course_id) || enrolledSet.has(c.course_id),
          covered_by_plan: planCovered.has(c.course_id),
        }));

        return widget({
          props: {
            total: coursesRes.count ?? courses.length,
            has_subscription: planIds.length > 0,
            courses,
          },
          output: text(
            courses.length === 0
              ? "No published courses found."
              : `Found ${coursesRes.count ?? courses.length} course(s); of the ones shown you are enrolled in ${courses.filter((c) => c.enrolled).length} and have access to ${courses.filter((c) => c.has_access).length}.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
