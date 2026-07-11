import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { widget, text } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, okText, errorResult, ResponseFormat, PaginationSchema } from "../format.js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve student display names by user id.
 *
 * `enrollments.user_id` and `exam_submissions.student_id` FK to `auth.users`,
 * NOT `profiles` — so PostgREST cannot embed `profiles` via those columns
 * (it errors: "Could not find a relationship ... in the schema cache").
 * `profiles.id` mirrors the auth user id 1:1, so we resolve names in a second,
 * RLS-scoped query instead of an embed.
 */
async function fetchProfileNames(
  supabase: SupabaseClient,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  for (const p of (data as { id: string; full_name: string | null }[] | null) ?? []) {
    if (p.full_name) names.set(p.id, p.full_name);
  }
  return names;
}

export function registerAnalyticsTools(server: MCPServer) {
  // ── lms_list_enrollments ─────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_list_enrollments",
      description: "List students enrolled in a course with their enrollment status and dates.",
      schema: z.object({
        ...PaginationSchema,
        course_id: z.number().describe("The course ID"),
        status: z
          .enum(["active", "disabled"])
          .optional()
          .describe("Filter by enrollment status"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id, status, limit, offset, response_format }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        await session.verifyCourseOwnership(course_id);
        const supabase = session.getClient();

        let query = supabase
          .from("enrollments")
          .select(`enrollment_id, status, enrollment_date, user_id`, {
            count: "exact",
          })
          .eq("course_id", course_id)
          .order("enrollment_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);

        const { data, error, count } = await query;
        if (error) return errorResult(`Listing enrollments: ${error.message}`);
        if (!data || data.length === 0) {
          return okText("No enrollments found.");
        }

        const names = await fetchProfileNames(
          supabase,
          data.map((e) => e.user_id)
        );

        const total = count || 0;
        const output = {
          total,
          count: data.length,
          offset,
          has_more: total > offset + data.length,
          next_offset:
            total > offset + data.length ? offset + data.length : undefined,
          enrollments: data.map((e) => ({
            id: e.enrollment_id,
            status: e.status,
            date: e.enrollment_date,
            student_id: e.user_id,
            student_name: names.get(e.user_id) ?? null,
          })),
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Enrollments for course ${course_id}`,
            `Showing ${data.length} of ${total} students`,
            "",
          ];
          for (const e of output.enrollments) {
            const name = e.student_name ?? e.student_id;
            lines.push(`- **${name}** [${e.status}] — enrolled ${e.date}`);
          }
          textContent = lines.join("\n");
        }

        return ok(output as unknown as Record<string, unknown>, textContent);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_list_exam_submissions (widget tool) ───────────────────────────────
  server.tool(
    {
      name: "lms_list_exam_submissions",
      description: "List all submissions for an exam with scores and review status.",
      schema: z.object({
        limit: PaginationSchema.limit,
        offset: PaginationSchema.offset,
        exam_id: z.number().describe("The exam ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      widget: {
        name: "exam-submissions",
        invoking: "Loading submissions...",
        invoked: "Submissions loaded",
      },
    },
    async ({ exam_id, limit, offset }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        await session.verifyExamOwnership(exam_id);
        const supabase = session.getClient();

        const { data, error, count } = await supabase
          .from("exam_submissions")
          .select(
            `submission_id, score, submission_date, review_status, student_id`,
            { count: "exact" }
          )
          .eq("exam_id", exam_id)
          .order("submission_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return errorResult(`Listing submissions: ${error.message}`);
        if (!data || data.length === 0) {
          return widget({
            props: { exam_id, total: 0, submissions: [] },
            output: text("No submissions found for this exam."),
          });
        }

        const names = await fetchProfileNames(
          supabase,
          data.map((s) => s.student_id)
        );

        const total = count || 0;
        const submissions = data.map((s) => ({
          id: s.submission_id as number,
          student_name: names.get(s.student_id) ?? null,
          score: s.score as number | null,
          submission_date: s.submission_date as string,
          review_status: s.review_status as string | null,
        }));

        return widget({
          props: { exam_id, total, submissions },
          output: text(`${total} submission(s).`),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_submission_details ────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_submission_details",
      description:
        "Get full details for a specific exam submission, including AI grading data and feedback.",
      schema: z.object({
        submission_id: z.number().describe("The submission ID"),
        response_format: PaginationSchema.response_format,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ submission_id, response_format }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        const supabase = session.getClient();

        const { data, error } = await supabase
          .from("exam_submissions")
          .select(
            `submission_id, score, submission_date, review_status, feedback, ai_data, student_id, exam_id`
          )
          .eq("submission_id", submission_id)
          .single();

        if (error || !data) return errorResult(`Submission ${submission_id} not found.`);

        await session.verifyExamOwnership(data.exam_id);

        const names = await fetchProfileNames(supabase, [data.student_id]);
        const output = {
          submission: {
            id: data.submission_id,
            exam_id: data.exam_id,
            student_id: data.student_id,
            student_name: names.get(data.student_id) ?? null,
            score: data.score,
            status: data.review_status,
            date: data.submission_date,
            feedback: data.feedback,
            ai_data: data.ai_data,
          },
        };

        let textContent: string;
        if (response_format === ResponseFormat.JSON) {
          textContent = JSON.stringify(output, null, 2);
        } else {
          const name = output.submission.student_name ?? output.submission.student_id;
          let result = `# Submission ${data.submission_id}\n\n`;
          result += `**Student:** ${name}\n`;
          result += `**Exam ID:** ${data.exam_id}\n`;
          result += `**Score:** ${data.score ?? "pending"}\n`;
          result += `**Review Status:** ${data.review_status ?? "pending"}\n`;
          result += `**Submitted:** ${data.submission_date}\n\n`;

          if (data.ai_data) {
            result += `## AI Data\n\n\`\`\`json\n${JSON.stringify(data.ai_data, null, 2)}\n\`\`\`\n\n`;
          }

          if (data.feedback) {
            result += `## Feedback\n\n${
              typeof data.feedback === "string"
                ? data.feedback
                : JSON.stringify(data.feedback, null, 2)
            }`;
          }
          textContent = result;
        }

        return ok(output as unknown as Record<string, unknown>, textContent);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_submission_for_grading (widget tool) ──────────────────────────
  server.tool(
    {
      name: "lms_get_submission_for_grading",
      description:
        "Get a full exam submission laid out for grading: every question with the student's answer, the AI-suggested points and feedback, and the current overall score. Renders an interactive grading widget where the teacher can override the score and write feedback. Use this (not lms_get_submission_details) when the teacher wants to review or grade a submission.",
      schema: z.object({
        submission_id: z.number().describe("The submission ID to grade"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      widget: {
        name: "submission-grader",
        invoking: "Loading submission…",
        invoked: "Submission ready to grade",
      },
    },
    async ({ submission_id }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        const supabase = session.getClient();

        const { data: sub, error: subErr } = await supabase
          .from("exam_submissions")
          .select(
            "submission_id, exam_id, student_id, score, feedback, review_status, submission_date, ai_data"
          )
          .eq("submission_id", submission_id)
          .single();

        if (subErr || !sub)
          return errorResult(`Submission ${submission_id} not found.`);

        await session.verifyExamOwnership(sub.exam_id as number);

        // Exam title + questions (with options for MC/TF context).
        const [{ data: exam }, { data: questions }, { data: scores }, { data: answers }, names] =
          await Promise.all([
            supabase.from("exams").select("title").eq("exam_id", sub.exam_id).single(),
            supabase
              .from("exam_questions")
              .select(
                "question_id, question_text, question_type, question_options(option_text, is_correct)"
              )
              .eq("exam_id", sub.exam_id)
              .order("question_id"),
            supabase
              .from("exam_question_scores")
              .select(
                "question_id, student_answer, points_earned, points_possible, is_correct, ai_feedback, ai_confidence, is_overridden"
              )
              .eq("submission_id", submission_id),
            supabase
              .from("exam_answers")
              .select("question_id, answer_text, is_correct, feedback")
              .eq("submission_id", submission_id),
            fetchProfileNames(supabase, [sub.student_id as string]),
          ]);

        const scoreByQ = new Map<number, any>();
        for (const s of (scores as any[]) ?? []) scoreByQ.set(s.question_id, s);
        const answerByQ = new Map<number, any>();
        for (const a of (answers as any[]) ?? []) answerByQ.set(a.question_id, a);
        const aiFeedback =
          ((sub.ai_data as any)?.question_feedback as Record<string, any>) ?? {};

        let earned = 0;
        let possible = 0;
        let graded = 0;

        const questionRows = ((questions as any[]) ?? []).map((q) => {
          const s = scoreByQ.get(q.question_id);
          const a = answerByQ.get(q.question_id);
          const aif = aiFeedback[String(q.question_id)] ?? {};

          const pointsEarned =
            s?.points_earned ?? (aif.points_earned as number | undefined) ?? null;
          const pointsPossible =
            s?.points_possible ?? (aif.points_possible as number | undefined) ?? null;
          if (pointsEarned != null) {
            earned += Number(pointsEarned);
            graded += 1;
          }
          if (pointsPossible != null) possible += Number(pointsPossible);

          return {
            question_id: q.question_id as number,
            text: (q.question_text as string) ?? "",
            type: (q.question_type as string) ?? "free_text",
            options:
              ((q.question_options as any[]) ?? []).map((o) => ({
                text: (o.option_text as string) ?? "",
                is_correct: !!o.is_correct,
              })) ?? [],
            student_answer:
              s?.student_answer ??
              a?.answer_text ??
              (aif.student_answer as string | undefined) ??
              null,
            points_earned: pointsEarned,
            points_possible: pointsPossible,
            is_correct:
              s?.is_correct ?? a?.is_correct ?? (aif.is_correct as boolean | undefined) ?? null,
            ai_feedback:
              s?.ai_feedback ?? a?.feedback ?? (aif.feedback as string | undefined) ?? null,
            ai_confidence: s?.ai_confidence ?? (aif.confidence as number | undefined) ?? null,
            is_overridden: !!s?.is_overridden,
          };
        });

        const props = {
          submission: {
            id: sub.submission_id as number,
            exam_id: sub.exam_id as number,
            exam_title: (exam?.title as string) ?? `Exam ${sub.exam_id}`,
            student_id: sub.student_id as string,
            student_name: names.get(sub.student_id as string) ?? null,
            score: (sub.score as number | null) ?? null,
            feedback:
              typeof sub.feedback === "string"
                ? (sub.feedback as string)
                : ((sub.ai_data as any)?.overall_feedback as string | undefined) ?? "",
            review_status: (sub.review_status as string | null) ?? "pending",
            date: sub.submission_date as string,
          },
          questions: questionRows,
          summary: {
            question_count: questionRows.length,
            graded_count: graded,
            total_points_earned: earned,
            total_points_possible: possible,
          },
        };

        const name = props.submission.student_name ?? props.submission.student_id;
        return widget({
          props,
          output: text(
            `Submission ${submission_id} by ${name} — ${questionRows.length} question(s), ` +
              `current score ${props.submission.score ?? "pending"}, status "${props.submission.review_status}". ` +
              `Override the score and feedback in the widget, then Save.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_grade_submission (mutation) ───────────────────────────────────────
  server.tool(
    {
      name: "lms_grade_submission",
      description:
        "Record a teacher's grade for an exam submission: set the overall score (0–100) and/or written feedback and mark it teacher-reviewed. Writes through row-level security (only the exam's owner may grade). Use after reviewing a submission with lms_get_submission_for_grading.",
      schema: z.object({
        submission_id: z.number().describe("The submission ID to grade"),
        score: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Overall score 0–100. Omit to keep the current score."),
        feedback: z
          .string()
          .optional()
          .describe("Overall written feedback for the student. Omit to keep current."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ submission_id, score, feedback }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        if (score === undefined && feedback === undefined) {
          return errorResult("Provide a score and/or feedback to grade the submission.");
        }

        const supabase = session.getClient();

        const { data: sub, error: subErr } = await supabase
          .from("exam_submissions")
          .select("submission_id, exam_id, student_id, score, feedback")
          .eq("submission_id", submission_id)
          .single();

        if (subErr || !sub)
          return errorResult(`Submission ${submission_id} not found.`);

        await session.verifyExamOwnership(sub.exam_id as number);

        const finalScore = score ?? (sub.score as number | null);
        const finalFeedback = feedback ?? (sub.feedback as string | null);

        // Primary write: the submission row (RLS: tenant teacher/admin may update).
        const { error: updErr } = await supabase
          .from("exam_submissions")
          .update({
            score: finalScore,
            feedback: finalFeedback,
            review_status: "teacher_reviewed",
            evaluated_at: new Date().toISOString(),
          })
          .eq("submission_id", submission_id);

        if (updErr) return errorResult(`Saving grade: ${updErr.message}`);

        // Keep exam_scores in sync so the score is consistent everywhere and the
        // certificate trigger (fires on exam_scores) sees the teacher's grade.
        // Only when we have a numeric score (exam_scores.score is required).
        if (finalScore != null) {
          const { error: scoreErr } = await supabase.from("exam_scores").upsert(
            {
              submission_id: submission_id,
              student_id: sub.student_id,
              exam_id: sub.exam_id,
              score: finalScore,
              feedback: finalFeedback,
            },
            { onConflict: "submission_id,student_id,exam_id" }
          );
          if (scoreErr)
            return errorResult(
              `Grade saved to submission, but syncing exam_scores failed: ${scoreErr.message}`
            );
        }

        return ok(
          {
            submission_id,
            score: finalScore,
            review_status: "teacher_reviewed",
            graded: true,
          },
          `Graded submission ${submission_id}: score ${finalScore ?? "unchanged"}, marked teacher-reviewed.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_student_progress (widget tool) ────────────────────────────────
  server.tool(
    {
      name: "lms_get_student_progress",
      description:
        "Per-student progress roster for a course: each enrolled student's lesson-completion %, exam average, last activity, and an at-risk flag (active but no lessons completed). Renders an interactive roster widget. Note: lesson-completion visibility requires a teacher/admin role; callers without it see 0% progress.",
      schema: z.object({
        ...PaginationSchema,
        course_id: z.number().describe("The course ID"),
        status: z
          .enum(["active", "disabled"])
          .optional()
          .describe("Filter by enrollment status"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      widget: {
        name: "student-progress-roster",
        invoking: "Loading roster…",
        invoked: "Roster loaded",
      },
    },
    async ({ course_id, status, limit, offset }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        await session.verifyCourseOwnership(course_id);
        const supabase = session.getClient();

        const { data: course } = await supabase
          .from("courses")
          .select("title")
          .eq("course_id", course_id)
          .single();

        // Published lessons define the progress denominator.
        const { data: lessons } = await supabase
          .from("lessons")
          .select("id")
          .eq("course_id", course_id)
          .eq("status", "published");
        const lessonIds = (lessons ?? []).map((l) => l.id as number);
        const publishedLessons = lessonIds.length;

        // Enrolled students (paginated).
        let enrollQuery = supabase
          .from("enrollments")
          .select("status, enrollment_date, user_id", { count: "exact" })
          .eq("course_id", course_id)
          .order("enrollment_date", { ascending: false })
          .range(offset, offset + limit - 1);
        if (status) enrollQuery = enrollQuery.eq("status", status);

        const { data: enrollments, error: enrollErr, count } = await enrollQuery;
        if (enrollErr) return errorResult(`Listing roster: ${enrollErr.message}`);

        if (!enrollments || enrollments.length === 0) {
          return widget({
            props: {
              course: { id: course_id, title: course?.title ?? `Course ${course_id}`, published_lessons: publishedLessons },
              students: [],
              summary: { total: 0, at_risk: 0, avg_progress: 0 },
            },
            output: text("No students enrolled in this course."),
          });
        }

        const userIds = enrollments.map((e) => e.user_id as string);

        // Per-user lesson completions (lesson_completions has NO tenant_id).
        const completedByUser = new Map<string, number>();
        const lastCompletionByUser = new Map<string, string>();
        if (publishedLessons > 0) {
          const { data: completions } = await supabase
            .from("lesson_completions")
            .select("user_id, completed_at")
            .in("lesson_id", lessonIds)
            .in("user_id", userIds);
          for (const c of (completions as any[]) ?? []) {
            completedByUser.set(c.user_id, (completedByUser.get(c.user_id) ?? 0) + 1);
            const prev = lastCompletionByUser.get(c.user_id);
            if (!prev || (c.completed_at && c.completed_at > prev))
              lastCompletionByUser.set(c.user_id, c.completed_at);
          }
        }

        // Per-user exam performance across this course's exams.
        const { data: exams } = await supabase
          .from("exams")
          .select("exam_id")
          .eq("course_id", course_id);
        const examIds = (exams ?? []).map((e) => e.exam_id as number);

        const examAgg = new Map<string, { sum: number; n: number; last: string | null }>();
        if (examIds.length > 0) {
          const { data: subs } = await supabase
            .from("exam_submissions")
            .select("student_id, score, submission_date")
            .in("exam_id", examIds)
            .in("student_id", userIds);
          for (const s of (subs as any[]) ?? []) {
            const a = examAgg.get(s.student_id) ?? { sum: 0, n: 0, last: null };
            if (s.score != null) {
              a.sum += Number(s.score);
              a.n += 1;
            }
            if (s.submission_date && (!a.last || s.submission_date > a.last))
              a.last = s.submission_date;
            examAgg.set(s.student_id, a);
          }
        }

        const names = await fetchProfileNames(supabase, userIds);

        const maxDate = (...ds: (string | null | undefined)[]) =>
          ds.filter((d): d is string => !!d).sort().pop() ?? null;

        const students = enrollments.map((e) => {
          const uid = e.user_id as string;
          const completed = completedByUser.get(uid) ?? 0;
          const progress =
            publishedLessons > 0 ? Math.round((completed / publishedLessons) * 100) : null;
          const ex = examAgg.get(uid);
          const examAvg = ex && ex.n > 0 ? Math.round(ex.sum / ex.n) : null;
          const isActive = e.status === "active";
          const atRisk = isActive && publishedLessons > 0 && completed === 0;
          return {
            student_id: uid,
            student_name: names.get(uid) ?? null,
            status: e.status as string,
            enrolled: e.enrollment_date as string,
            completed_lessons: completed,
            progress_pct: progress,
            exam_avg: examAvg,
            exam_count: ex?.n ?? 0,
            last_active: maxDate(
              lastCompletionByUser.get(uid),
              ex?.last,
              e.enrollment_date as string
            ),
            at_risk: atRisk,
          };
        });

        // At-risk first, then lowest progress.
        students.sort((a, b) => {
          if (a.at_risk !== b.at_risk) return a.at_risk ? -1 : 1;
          return (a.progress_pct ?? 0) - (b.progress_pct ?? 0);
        });

        const atRiskCount = students.filter((s) => s.at_risk).length;
        const avgProgress =
          students.length > 0
            ? Math.round(
                students.reduce((acc, s) => acc + (s.progress_pct ?? 0), 0) / students.length
              )
            : 0;

        const props = {
          course: {
            id: course_id,
            title: course?.title ?? `Course ${course_id}`,
            published_lessons: publishedLessons,
          },
          students,
          summary: {
            total: count ?? students.length,
            at_risk: atRiskCount,
            avg_progress: avgProgress,
          },
        };

        return widget({
          props,
          output: text(
            `${students.length} student(s) in "${props.course.title}" — avg progress ${avgProgress}%, ${atRiskCount} at risk.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_course_stats ──────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_course_stats",
      description:
        "Get aggregate statistics for a course: enrollment, completion, and exam performance.",
      schema: z.object({
        course_id: z.number().describe("The course ID"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course_id }, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        await session.verifyCourseOwnership(course_id);
        const supabase = session.getClient();

        const { data: course } = await supabase
          .from("courses")
          .select("title, status")
          .eq("course_id", course_id)
          .single();

        const { count: enrollmentCount } = await supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("course_id", course_id)
          .eq("status", "active");

        const { data: lessons } = await supabase
          .from("lessons")
          .select("id")
          .eq("course_id", course_id)
          .eq("status", "published");

        const lessonCount = lessons?.length ?? 0;

        let completionRate = 0;
        if (lessonCount > 0 && (enrollmentCount ?? 0) > 0) {
          // lesson_completions has NO tenant_id — filter only by lesson_id
          const { count: completionCount } = await supabase
            .from("lesson_completions")
            .select("*", { count: "exact", head: true })
            .in("lesson_id", lessons!.map((l) => l.id));

          const totalPossible = lessonCount * (enrollmentCount ?? 0);
          completionRate = Math.round(((completionCount ?? 0) / totalPossible) * 100);
        }

        const { data: exams } = await supabase
          .from("exams")
          .select("exam_id")
          .eq("course_id", course_id);

        let avgScore = 0;
        let totalSubmissions = 0;
        if (exams && exams.length > 0) {
          const { data: submissions } = await supabase
            .from("exam_submissions")
            .select("score")
            .in("exam_id", exams.map((e) => e.exam_id))
            .not("score", "is", null);

          if (submissions && submissions.length > 0) {
            totalSubmissions = submissions.length;
            const sum = submissions.reduce((acc, s) => acc + (s.score ?? 0), 0);
            avgScore = Math.round(sum / submissions.length);
          }
        }

        const output = {
          course_id,
          title: course?.title,
          status: course?.status,
          active_enrollments: enrollmentCount ?? 0,
          published_lessons: lessonCount,
          completion_rate: completionRate,
          exam_count: exams?.length ?? 0,
          submission_count: totalSubmissions,
          average_score: totalSubmissions > 0 ? avgScore : null,
        };

        let result = `# Course Stats: ${course?.title ?? `Course ${course_id}`}\n\n`;
        result += `**Status:** ${course?.status ?? "unknown"}\n`;
        result += `**Active Enrollments:** ${output.active_enrollments}\n`;
        result += `**Published Lessons:** ${output.published_lessons}\n`;
        result += `**Lesson Completion Rate:** ${output.completion_rate}%\n`;
        result += `**Total Exams:** ${output.exam_count}\n`;
        result += `**Exam Submissions:** ${output.submission_count}\n`;
        result += `**Average Exam Score:** ${
          output.average_score !== null ? `${output.average_score}%` : "N/A"
        }`;

        return ok(output as unknown as Record<string, unknown>, result);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_school_stats (widget tool, admin-only) ────────────────────────
  server.tool(
    {
      name: "lms_get_school_stats",
      description:
        "School-wide overview across every course in the tenant: course counts by status, total students and active enrollments, overall lesson-completion rate, exam volume and average score, at-risk student count, and a per-course breakdown. Admin only. Renders a dashboard widget.",
      schema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      widget: {
        name: "school-overview",
        invoking: "Crunching school stats…",
        invoked: "School overview ready",
      },
    },
    async (_input, ctx) => {
      try {
        let session: LmsSession;
        try {
          session = LmsSession.fromContext(ctx);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }

        const supabase = session.getClient();
        const tenantId = session.getTenantId();

        // Tenant name (best-effort) for the header.
        let schoolName = "Your school";
        const { data: tenant } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", tenantId)
          .maybeSingle();
        if (tenant?.name) schoolName = tenant.name as string;

        // All courses visible to this admin in the tenant.
        const { data: courses, error: cErr } = await supabase
          .from("courses")
          .select("course_id, title, status")
          .eq("tenant_id", tenantId);
        if (cErr) return errorResult(`Loading courses: ${cErr.message}`);

        const courseList = (courses as any[]) ?? [];
        if (courseList.length === 0) {
          return widget({
            props: {
              school: {
                name: schoolName,
                courses_total: 0,
                courses_published: 0,
                courses_draft: 0,
                courses_archived: 0,
                active_enrollments: 0,
                students: 0,
                published_lessons: 0,
                completion_rate: 0,
                exam_submissions: 0,
                avg_exam_score: null,
                at_risk_students: 0,
              },
              courses: [],
            },
            output: text("No courses in this school yet."),
          });
        }

        const courseIds = courseList.map((c) => c.course_id as number);
        const byStatus = { published: 0, draft: 0, archived: 0 };
        for (const c of courseList) {
          if (c.status in byStatus) (byStatus as any)[c.status] += 1;
        }

        // Bulk fetch (no N+1): enrollments, published lessons, completions, exams, submissions.
        const [
          { data: enrollments },
          { data: lessons },
          { data: exams },
        ] = await Promise.all([
          supabase
            .from("enrollments")
            .select("course_id, user_id, status")
            .in("course_id", courseIds),
          supabase
            .from("lessons")
            .select("id, course_id")
            .eq("status", "published")
            .in("course_id", courseIds),
          supabase.from("exams").select("exam_id, course_id").in("course_id", courseIds),
        ]);

        const lessonRows = (lessons as any[]) ?? [];
        const lessonToCourse = new Map<number, number>();
        const publishedByCourse = new Map<number, number>();
        for (const l of lessonRows) {
          lessonToCourse.set(l.id, l.course_id);
          publishedByCourse.set(l.course_id, (publishedByCourse.get(l.course_id) ?? 0) + 1);
        }
        const lessonIds = lessonRows.map((l) => l.id as number);

        const examRows = (exams as any[]) ?? [];
        const examToCourse = new Map<number, number>();
        for (const e of examRows) examToCourse.set(e.exam_id, e.course_id);
        const examIds = examRows.map((e) => e.exam_id as number);

        // Completions + submissions depend on the id lists above.
        const [{ data: completions }, { data: submissions }] = await Promise.all([
          lessonIds.length > 0
            ? supabase
                .from("lesson_completions")
                .select("user_id, lesson_id")
                .in("lesson_id", lessonIds)
            : Promise.resolve({ data: [] as any[] }),
          examIds.length > 0
            ? supabase
                .from("exam_submissions")
                .select("exam_id, score")
                .in("exam_id", examIds)
                .not("score", "is", null)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        // Per-course accumulators.
        const activeEnrollByCourse = new Map<number, number>();
        const studentSet = new Set<string>();
        const activeEnrollPairs: { user: string; course: number }[] = [];
        for (const e of (enrollments as any[]) ?? []) {
          if (e.status === "active") {
            activeEnrollByCourse.set(
              e.course_id,
              (activeEnrollByCourse.get(e.course_id) ?? 0) + 1
            );
            studentSet.add(e.user_id);
            activeEnrollPairs.push({ user: e.user_id, course: e.course_id });
          }
        }

        const completionsByCourse = new Map<number, number>();
        const completedPair = new Set<string>(); // `${user}|${course}`
        for (const c of (completions as any[]) ?? []) {
          const courseId = lessonToCourse.get(c.lesson_id);
          if (courseId == null) continue;
          completionsByCourse.set(courseId, (completionsByCourse.get(courseId) ?? 0) + 1);
          completedPair.add(`${c.user_id}|${courseId}`);
        }

        const scoreSumByCourse = new Map<number, number>();
        const scoreCountByCourse = new Map<number, number>();
        let schoolScoreSum = 0;
        let schoolScoreCount = 0;
        for (const s of (submissions as any[]) ?? []) {
          const courseId = examToCourse.get(s.exam_id);
          if (courseId == null || s.score == null) continue;
          scoreSumByCourse.set(courseId, (scoreSumByCourse.get(courseId) ?? 0) + Number(s.score));
          scoreCountByCourse.set(courseId, (scoreCountByCourse.get(courseId) ?? 0) + 1);
          schoolScoreSum += Number(s.score);
          schoolScoreCount += 1;
        }

        // At-risk: active enrollment, course has published lessons, zero completions.
        let atRisk = 0;
        for (const p of activeEnrollPairs) {
          if ((publishedByCourse.get(p.course) ?? 0) > 0 && !completedPair.has(`${p.user}|${p.course}`))
            atRisk += 1;
        }

        // Per-course rows.
        const courseRows = courseList.map((c) => {
          const id = c.course_id as number;
          const active = activeEnrollByCourse.get(id) ?? 0;
          const published = publishedByCourse.get(id) ?? 0;
          const totalPossible = published * active;
          const done = completionsByCourse.get(id) ?? 0;
          const completion = totalPossible > 0 ? Math.round((done / totalPossible) * 100) : 0;
          const sc = scoreCountByCourse.get(id) ?? 0;
          const examAvg = sc > 0 ? Math.round((scoreSumByCourse.get(id) ?? 0) / sc) : null;
          return {
            id,
            title: c.title as string,
            status: c.status as string,
            active_enrollments: active,
            published_lessons: published,
            completion_rate: completion,
            exam_avg: examAvg,
            submission_count: sc,
          };
        });
        courseRows.sort((a, b) => b.active_enrollments - a.active_enrollments);

        // School-wide completion rate.
        let totalPossible = 0;
        let totalDone = 0;
        for (const c of courseList) {
          const id = c.course_id as number;
          totalPossible += (publishedByCourse.get(id) ?? 0) * (activeEnrollByCourse.get(id) ?? 0);
          totalDone += completionsByCourse.get(id) ?? 0;
        }
        const schoolCompletion =
          totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

        const totalActive = [...activeEnrollByCourse.values()].reduce((a, b) => a + b, 0);
        const totalPublishedLessons = lessonRows.length;

        const props = {
          school: {
            name: schoolName,
            courses_total: courseList.length,
            courses_published: byStatus.published,
            courses_draft: byStatus.draft,
            courses_archived: byStatus.archived,
            active_enrollments: totalActive,
            students: studentSet.size,
            published_lessons: totalPublishedLessons,
            completion_rate: schoolCompletion,
            exam_submissions: schoolScoreCount,
            avg_exam_score: schoolScoreCount > 0 ? Math.round(schoolScoreSum / schoolScoreCount) : null,
            at_risk_students: atRisk,
          },
          courses: courseRows,
        };

        return widget({
          props,
          output: text(
            `${schoolName}: ${courseList.length} course(s) (${byStatus.published} published), ` +
              `${studentSet.size} student(s), ${totalActive} active enrollment(s), ` +
              `${schoolCompletion}% avg completion, ${atRisk} at risk.`
          ),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_get_confusion_hotspots ───────────────────────────────────────────
  // Epic #348 Phase 3 (#360). Teacher/admin only (not in STUDENT_TOOLS).
  // Aggregates three struggle signals for one course: practice-quiz topics,
  // failed exercise evaluations, and exam-question miss rates.
  //
  // Tenant scoping: practice_attempts and exercise_evaluations HAVE tenant_id
  // (teacher-tenant SELECT policies exist on both). exam_question_scores /
  // exam_questions have NO tenant_id — they are reached ONLY through the
  // course's tenant-scoped exams → submissions chain, never queried at large.
  server.tool(
    {
      name: "lms_get_confusion_hotspots",
      description:
        "Where students collectively struggle in a course: practice topics with low scores, exercises students are stuck on, and exam questions with high miss rates. Ranked by severity. Use it to decide what to reteach or which remediation exercises to draft.",
      schema: z.object({
        course_id: z.number().describe("The course to analyze"),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Look-back window in days (default 30)"),
      }),
      annotations: {
        readOnlyHint: true,
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
        await session.verifyCourseOwnership(input.course_id);
        const supabase = session.getClient();
        const tenantId = session.getTenantId();
        const days = input.days ?? 30;
        const cutoffIso = new Date(Date.now() - days * 86400000).toISOString();
        const MISS_RATIO = 0.7; // same threshold as lms_get_mock_exam_source
        const EVIDENCE_CAP = 3;

        type Hotspot = {
          scope: "lesson" | "exercise" | "exam_question";
          ref: number | string | null;
          label: string;
          students_affected: number;
          severity: number; // 0-100, see severity_formula in the output
          evidence: string;
        };
        const hotspots: Hotspot[] = [];
        // severity = round(intensity * 60 + min(students_affected, 10) * 4)
        // where intensity ∈ [0,1] is how badly the group fails the item.
        const severityOf = (intensity: number, students: number) =>
          Math.min(100, Math.round(intensity * 60 + Math.min(students, 10) * 4));

        // 1. Practice topics (HAS tenant_id; teacher-tenant RLS SELECT).
        //    Degrade gracefully if the table isn't migrated in this env.
        let practiceCount = 0;
        const practiceRes = await supabase
          .from("practice_attempts")
          .select("topic, lesson_id, score, user_id, created_at")
          .eq("tenant_id", tenantId)
          .eq("course_id", input.course_id)
          .gte("created_at", cutoffIso)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (!practiceRes.error) {
          const rows = (practiceRes.data ?? []) as Array<{
            topic: string;
            lesson_id: number | null;
            score: number;
            user_id: string;
          }>;
          practiceCount = rows.length;
          const byTopic = new Map<
            string,
            { scores: number[]; users: Set<string>; below70: Set<string>; lesson_id: number | null }
          >();
          for (const r of rows) {
            const b = byTopic.get(r.topic) ?? {
              scores: [],
              users: new Set<string>(),
              below70: new Set<string>(),
              lesson_id: r.lesson_id,
            };
            b.scores.push(Number(r.score));
            b.users.add(r.user_id);
            if (Number(r.score) < 70) b.below70.add(r.user_id);
            byTopic.set(r.topic, b);
          }
          for (const [topic, b] of byTopic) {
            if (b.below70.size === 0) continue;
            const avg = b.scores.reduce((s, v) => s + v, 0) / b.scores.length;
            hotspots.push({
              scope: "lesson",
              ref: b.lesson_id,
              label: `Practice: ${topic}`,
              students_affected: b.below70.size,
              severity: severityOf(1 - avg / 100, b.below70.size),
              evidence: `${b.scores.length} attempt(s) by ${b.users.size} student(s), avg score ${Math.round(avg)}; ${b.below70.size} student(s) below 70`,
            });
          }
        }

        // 2. Exercise evaluations (HAS tenant_id): who is stuck, per exercise.
        //    !inner so the embedded course filter restricts parent rows.
        const evalsRes = await supabase
          .from("exercise_evaluations")
          .select(
            "exercise_id, user_id, attempt_number, passed, score, created_at, exercises!inner(title, course_id)"
          )
          .eq("tenant_id", tenantId)
          .eq("exercises.course_id", input.course_id)
          .gte("created_at", cutoffIso)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (evalsRes.error)
          return errorResult(`Loading exercise evaluations: ${evalsRes.error.message}`);
        {
          type EvalRow = {
            exercise_id: number;
            user_id: string;
            attempt_number: number;
            passed: boolean;
            exercises: { title: string } | null;
          };
          const rows = (evalsRes.data ?? []) as unknown as EvalRow[];
          // Rows are newest-first: first row per (exercise, user) = latest attempt.
          const latest = new Map<string, EvalRow>();
          const maxAttempts = new Map<string, number>();
          for (const r of rows) {
            const key = `${r.exercise_id}:${r.user_id}`;
            if (!latest.has(key)) latest.set(key, r);
            maxAttempts.set(
              key,
              Math.max(maxAttempts.get(key) ?? 0, Number(r.attempt_number))
            );
          }
          const byExercise = new Map<
            number,
            { title: string; stuck: Set<string>; total: Set<string>; attempts: number[] }
          >();
          for (const [key, r] of latest) {
            const b = byExercise.get(r.exercise_id) ?? {
              title: r.exercises?.title ?? `Exercise ${r.exercise_id}`,
              stuck: new Set<string>(),
              total: new Set<string>(),
              attempts: [],
            };
            b.total.add(r.user_id);
            b.attempts.push(maxAttempts.get(key) ?? 1);
            if (!r.passed) b.stuck.add(r.user_id);
            byExercise.set(r.exercise_id, b);
          }
          for (const [exerciseId, b] of byExercise) {
            if (b.stuck.size === 0) continue;
            const avgAttempts =
              b.attempts.reduce((s, v) => s + v, 0) / b.attempts.length;
            hotspots.push({
              scope: "exercise",
              ref: exerciseId,
              label: `Exercise: ${b.title}`,
              students_affected: b.stuck.size,
              severity: severityOf(b.stuck.size / b.total.size, b.stuck.size),
              evidence: `${b.stuck.size} of ${b.total.size} student(s) not passing on their latest attempt; avg ${avgAttempts.toFixed(1)} attempt(s) per student`,
            });
          }
        }

        // 3. Exam-question miss rates. Chain: course exams (tenant-scoped) →
        //    submissions (tenant-scoped) → per-question scores (no tenant_id;
        //    scoped only via .in(submission_id) from the chain above).
        const examsRes = await supabase
          .from("exams")
          .select("exam_id, title")
          .eq("course_id", input.course_id)
          .eq("tenant_id", tenantId);
        if (examsRes.error)
          return errorResult(`Loading exams: ${examsRes.error.message}`);
        const examTitles = new Map<number, string>(
          (examsRes.data ?? []).map((e) => [e.exam_id as number, e.title as string])
        );
        let submissionCount = 0;
        if (examTitles.size > 0) {
          const subsRes = await supabase
            .from("exam_submissions")
            .select("submission_id, student_id, exam_id, submission_date")
            .eq("tenant_id", tenantId)
            .in("exam_id", [...examTitles.keys()])
            .gte("submission_date", cutoffIso)
            .order("submission_date", { ascending: false })
            .limit(300);
          if (subsRes.error)
            return errorResult(`Loading submissions: ${subsRes.error.message}`);
          // Latest submission per (student, exam) — newest-first order.
          const latestSubs = new Map<
            string,
            { submission_id: number; student_id: string; exam_id: number }
          >();
          for (const s of subsRes.data ?? []) {
            const key = `${s.student_id}:${s.exam_id}`;
            if (!latestSubs.has(key))
              latestSubs.set(key, {
                submission_id: s.submission_id as number,
                student_id: s.student_id as string,
                exam_id: s.exam_id as number,
              });
          }
          submissionCount = latestSubs.size;
          const subMeta = new Map(
            [...latestSubs.values()].map((s) => [s.submission_id, s])
          );
          if (subMeta.size > 0) {
            const scoresRes = await supabase
              .from("exam_question_scores")
              .select(
                "submission_id, question_id, is_correct, points_earned, points_possible, exam_questions(question_text, exam_id)"
              )
              .in("submission_id", [...subMeta.keys()]);
            if (scoresRes.error)
              return errorResult(
                `Loading question scores: ${scoresRes.error.message}`
              );
            const byQuestion = new Map<
              number,
              { text: string; exam_id: number | null; attempts: number; missers: Set<string> }
            >();
            for (const row of (scoresRes.data ?? []) as unknown as Array<{
              submission_id: number;
              question_id: number;
              is_correct: boolean | null;
              points_earned: number | null;
              points_possible: number | null;
              exam_questions: { question_text: string; exam_id: number } | null;
            }>) {
              const meta = subMeta.get(row.submission_id);
              if (!meta) continue;
              const b = byQuestion.get(row.question_id) ?? {
                text: row.exam_questions?.question_text ?? `Question ${row.question_id}`,
                exam_id: row.exam_questions?.exam_id ?? null,
                attempts: 0,
                missers: new Set<string>(),
              };
              b.attempts += 1;
              const missed =
                row.is_correct === false ||
                (row.points_possible !== null &&
                  Number(row.points_possible) > 0 &&
                  Number(row.points_earned ?? 0) / Number(row.points_possible) <
                    MISS_RATIO);
              if (missed) b.missers.add(meta.student_id);
              byQuestion.set(row.question_id, b);
            }
            for (const [questionId, b] of byQuestion) {
              if (b.missers.size === 0) continue;
              const missRate = b.missers.size / b.attempts;
              const examTitle = b.exam_id !== null ? examTitles.get(b.exam_id) : null;
              hotspots.push({
                scope: "exam_question",
                ref: questionId,
                label: `${examTitle ? `${examTitle}: ` : ""}"${b.text.slice(0, 120)}"`,
                students_affected: b.missers.size,
                severity: severityOf(missRate, b.missers.size),
                evidence: `${b.missers.size} of ${b.attempts} student(s) missed it on their latest submission (${Math.round(missRate * 100)}% miss rate)`,
              });
            }
          }
        }

        hotspots.sort((a, b) => b.severity - a.severity);
        const top = hotspots.slice(0, 20);

        return ok(
          {
            course_id: input.course_id,
            window_days: days,
            hotspots: top,
            truncated: hotspots.length > top.length,
            sources: {
              practice_attempts: practiceCount,
              exercise_evaluations: (evalsRes.data ?? []).length,
              exam_submissions: submissionCount,
            },
            severity_formula:
              "severity = round(intensity * 60 + min(students_affected, 10) * 4), capped at 100. intensity: practice = 1 - avg_score/100; exercise = share of attempting students whose latest attempt failed; exam_question = miss rate across latest submissions (miss = incorrect or < 70% of points).",
          },
          top.length === 0
            ? `No confusion hotspots in the last ${days} day(s) — no low practice scores, stuck students, or missed exam questions on record for this course.`
            : `${top.length} hotspot(s) (last ${days} days), worst first: ${top
                .slice(0, EVIDENCE_CAP)
                .map((h) => `${h.label} (${h.students_affected} student(s), severity ${h.severity})`)
                .join("; ")}${top.length > EVIDENCE_CAP ? "; …" : ""}. Consider drafting remediation with the generate-remediation-exercises prompt.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
