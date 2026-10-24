import { z } from "zod";
import type { LmsServer } from "../server-types.js";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";
import { getAppOrigin } from "../env.js";

/**
 * Take and submit a REAL exam as the caller (student tier).
 *
 * Mirrors the web flow (student/courses/[courseId]/exams/[examId]):
 *   1. `lms_get_exam_for_student` — the published exam's questions and options.
 *      Never an answer key: `exam_grading_secrets` is staff-only (#840) and this
 *      tool selects only the columns the web take-page selects. A student gets
 *      the right answers only AFTER grading, via lms_my_exam_results.
 *   2. `lms_submit_exam` — `submit_exam(p_exam_id, p_answers)` is the only
 *      client write path into exam_submissions / exam_answers (#847), then the
 *      app's `POST /api/exams/[examId]/grade` (#839, Bearer auth) grades it on
 *      the school's own AI key. The host never picks a score. With no app
 *      origin, no AI key or a provider failure the submission stays `pending`
 *      (the answers are saved) — the result says so; nothing is invented.
 *
 * Entitlement is checked with `has_course_access` before either tool returns
 * anything (the RPC and RLS re-check `can_read_exam` regardless).
 * Answers are never logged; audit.ts sanitises tool args by key name only, so
 * the answers arrive there as an object of ids — callers must not echo them.
 */

const GRADER_TIMEOUT_MS: number = 110_000;

export type ExamGradeOutcome =
  | {
      ok: true;
      score: number | null;
      overall_feedback: string | null;
      /** True when the grader parked the submission for teacher review. */
      pending_teacher_review: boolean;
    }
  | { ok: false; pending: true; reason: string };

/**
 * Ask the app to grade the caller's own submission. Never throws; every
 * failure resolves to `{ ok: false, pending: true }` because the submission
 * (already written) simply stays pending and can be graded again.
 */
export async function gradeExamWithPlatform(
  appOrigin: string,
  accessToken: string,
  examId: number,
  submissionId: number,
  fetchImpl: typeof fetch = fetch
): Promise<ExamGradeOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${appOrigin}/api/exams/${examId}/grade`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submissionId }),
      signal: AbortSignal.timeout(GRADER_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    return {
      ok: false,
      pending: true,
      reason:
        name === "TimeoutError" || name === "AbortError"
          ? "The platform grader did not answer in time."
          : "Could not reach the platform grader.",
    };
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await res.json()) ?? {}) as Record<string, unknown>;
  } catch {
    // Non-JSON body — fall through with no detail.
  }

  if (res.ok) {
    const feedback =
      typeof body.overall_feedback === "string" ? body.overall_feedback : null;
    return {
      ok: true,
      score: typeof body.score === "number" ? body.score : null,
      overall_feedback: feedback,
      pending_teacher_review: feedback === "pending_teacher_review",
    };
  }

  // Typed AI failure: { error: { code, ... } } — keep the code, drop the rest.
  const err = body.error;
  const code =
    err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : null;
  if (res.status === 409)
    return { ok: false, pending: true, reason: "This submission was already graded." };
  return {
    ok: false,
    pending: true,
    reason: code
      ? `The school's AI grader is unavailable (${code}).`
      : `The platform grader failed (HTTP ${res.status}).`,
  };
}

/** Keep only `question_id → string` pairs for question ids that belong to the exam. */
export function normalizeExamAnswers(
  answers: Array<{ question_id: number; answer: string }>,
  validQuestionIds: Set<number>
): { payload: Record<string, string>; unknownIds: number[] } {
  const payload: Record<string, string> = {};
  const unknownIds: number[] = [];
  for (const a of answers) {
    if (!validQuestionIds.has(a.question_id)) {
      unknownIds.push(a.question_id);
      continue;
    }
    payload[String(a.question_id)] = a.answer;
  }
  return { payload, unknownIds };
}

interface ExamRow {
  exam_id: number;
  course_id: number;
  title: string;
  description: string | null;
  duration: number | null;
  status: string;
}

interface QuestionRow {
  question_id: number;
  question_text: string;
  question_type: string;
  question_options: Array<{ option_id: number; option_text: string }> | null;
}

/**
 * Load the published exam in the caller's tenant and verify course access.
 * Returns an error message when the caller must not see it.
 */
async function loadAccessibleExam(
  session: LmsSession,
  examId: number
): Promise<{ exam: ExamRow } | { error: string }> {
  const supabase = session.getClient();
  const { data: exam, error } = await supabase
    .from("exams")
    .select("exam_id, course_id, title, description, duration, status")
    .eq("exam_id", examId)
    .eq("tenant_id", session.getTenantId())
    .eq("status", "published")
    .maybeSingle();
  if (error) return { error: `Loading exam: ${error.message}` };
  // Same wording for "missing", "draft" and "other school" — no existence leak.
  if (!exam) return { error: `Exam ${examId} not found or not published.` };

  const access = await supabase.rpc("has_course_access", {
    _user_id: session.getUserId(),
    _course_id: (exam as ExamRow).course_id,
  });
  if (access.error) return { error: `Checking course access: ${access.error.message}` };
  if (access.data !== true)
    return {
      error: `You do not have access to the course this exam belongs to. Enroll (lms_enroll_in_course) or buy access first.`,
    };
  return { exam: exam as ExamRow };
}

async function existingSubmissionId(
  session: LmsSession,
  examId: number
): Promise<{ id: number | null } | { error: string }> {
  const { data, error } = await session
    .getClient()
    .from("exam_submissions")
    .select("submission_id")
    .eq("exam_id", examId)
    .eq("student_id", session.getUserId())
    .eq("tenant_id", session.getTenantId())
    .maybeSingle();
  if (error) return { error: `Checking existing submission: ${error.message}` };
  return { id: data ? (data.submission_id as number) : null };
}

export function registerExamTakingTools(server: LmsServer) {
  // ── lms_get_exam_for_student ───────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_exam_for_student",
      description:
        "Fetch a published exam the caller may take, for presenting it to the student: title, duration (minutes), and each question with its type and options (option_id + text). Never includes answers or grading criteria. Requires course access. If the caller already submitted this exam, returns that fact (and the submission id) instead of the questions — exams are taken once; use lms_my_exam_results for the outcome. Answer format for lms_submit_exam: multiple_choice → the chosen option_id as a string; true_false → \"true\" or \"false\"; free_text → the student's text verbatim.",
      schema: z.object({
        exam_id: z.number().int().positive().describe("The exam to take"),
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
        const loaded = await loadAccessibleExam(session, input.exam_id);
        if ("error" in loaded) return errorResult(loaded.error);
        const { exam } = loaded;

        const existing = await existingSubmissionId(session, exam.exam_id);
        if ("error" in existing) return errorResult(existing.error);
        if (existing.id !== null) {
          return ok(
            {
              exam_id: exam.exam_id,
              title: exam.title,
              already_submitted: true,
              submission_id: existing.id,
            },
            `You already submitted "${exam.title}" (submission ${existing.id}). Use lms_my_exam_results for the outcome.`
          );
        }

        const qRes = await session
          .getClient()
          .from("exam_questions")
          .select(
            "question_id, question_text, question_type, question_options(option_id, option_text)"
          )
          .eq("exam_id", exam.exam_id)
          .order("sequence", { ascending: true, nullsFirst: false })
          .order("question_id", { ascending: true });
        if (qRes.error) return errorResult(`Loading questions: ${qRes.error.message}`);

        const questions = ((qRes.data ?? []) as unknown as QuestionRow[]).map((q) => ({
          question_id: q.question_id,
          question_text: q.question_text,
          question_type: q.question_type,
          options:
            q.question_type === "multiple_choice"
              ? (q.question_options ?? [])
                  .map((o) => ({ option_id: o.option_id, option_text: o.option_text }))
                  .sort((a, b) => a.option_id - b.option_id)
              : undefined,
        }));

        return ok(
          {
            exam_id: exam.exam_id,
            course_id: exam.course_id,
            title: exam.title,
            description: exam.description,
            duration_minutes: exam.duration,
            already_submitted: false,
            questions,
          },
          questions.length === 0
            ? `"${exam.title}" has no questions yet.`
            : `"${exam.title}": ${questions.length} question(s)${exam.duration ? `, ${exam.duration} min` : ""}. Present them to the student, collect THEIR answers, then call lms_submit_exam once. The exam can only be submitted one time, and you must never answer on their behalf.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ── lms_submit_exam ────────────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_submit_exam",
      description:
        "Submit the STUDENT'S OWN answers to an exam (from lms_get_exam_for_student) and have the platform grade it. Send exactly what the student answered — never guesses or your own answers; omit a question the student left blank. The attempt is one-time and counts (score, XP, certificates). The platform grades with the school's AI (you never choose the score): the result is the score and feedback, or status 'pending' when grading could not run (no AI key / provider down / needs teacher review) — the answers are saved either way; check lms_my_exam_results later. Only call when the student confirms they want to submit.",
      schema: z.object({
        exam_id: z.number().int().positive().describe("The exam being submitted"),
        answers: z
          .array(
            z.object({
              question_id: z.number().int().positive(),
              answer: z
                .string()
                .max(20000)
                .describe(
                  "multiple_choice: option_id as a string; true_false: 'true'|'false'; free_text: the student's text verbatim"
                ),
            })
          )
          .max(200)
          .describe("One entry per answered question"),
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
        const supabase = session.getClient();
        const loaded = await loadAccessibleExam(session, input.exam_id);
        if ("error" in loaded) return errorResult(loaded.error);
        const { exam } = loaded;

        const qRes = await supabase
          .from("exam_questions")
          .select("question_id")
          .eq("exam_id", exam.exam_id);
        if (qRes.error) return errorResult(`Loading questions: ${qRes.error.message}`);
        const validIds = new Set<number>(
          ((qRes.data ?? []) as Array<{ question_id: number }>).map((q) => q.question_id)
        );
        if (validIds.size === 0)
          return errorResult(`Exam "${exam.title}" has no questions to answer.`);

        const { payload, unknownIds } = normalizeExamAnswers(input.answers, validIds);
        if (unknownIds.length > 0)
          return errorResult(
            `Question id(s) ${unknownIds.join(", ")} do not belong to exam ${exam.exam_id}. Nothing was submitted — re-fetch the exam with lms_get_exam_for_student.`
          );

        // The only client write path (#847). Idempotent: a retry returns the
        // same submission and leaves its answers alone.
        const sub = await supabase.rpc("submit_exam", {
          p_exam_id: exam.exam_id,
          p_answers: payload,
        });
        if (sub.error || typeof sub.data !== "number")
          return errorResult(
            `Submitting exam: ${sub.error?.message ?? "no submission id returned"}`
          );
        const submissionId = sub.data;

        const base = {
          exam_id: exam.exam_id,
          submission_id: submissionId,
          answered_count: Object.keys(payload).length,
          question_count: validIds.size,
        };

        // Already graded (a retry after success)? Report it, don't re-grade.
        const scored = await supabase
          .from("exam_submissions")
          .select("score")
          .eq("submission_id", submissionId)
          .eq("student_id", session.getUserId())
          .maybeSingle();
        if (!scored.error && scored.data && scored.data.score !== null) {
          return ok(
            { ...base, status: "graded", score: Number(scored.data.score) },
            `"${exam.title}" was already submitted and graded: ${Number(scored.data.score)}. Use lms_my_exam_results for the per-question breakdown.`
          );
        }

        const appOrigin = getAppOrigin();
        if (!appOrigin) {
          return ok(
            { ...base, status: "pending", score: null },
            `Answers for "${exam.title}" are saved (submission ${submissionId}) but grading is unavailable here: this MCP server has no LMS app address. The score will appear in the LMS app / lms_my_exam_results once graded.`
          );
        }

        const outcome = await gradeExamWithPlatform(
          appOrigin,
          session.getAccessToken(),
          exam.exam_id,
          submissionId
        );

        if (!outcome.ok || outcome.pending_teacher_review) {
          const reason = outcome.ok
            ? "It was sent to the teacher for review."
            : outcome.reason;
          return ok(
            { ...base, status: "pending", score: null },
            `Answers for "${exam.title}" are saved (submission ${submissionId}) and the exam counts as submitted, but it is not graded yet. ${reason} Check lms_my_exam_results later; do not estimate a score.`
          );
        }

        return ok(
          {
            ...base,
            status: "graded",
            score: outcome.score,
            overall_feedback: outcome.overall_feedback,
          },
          `"${exam.title}" graded by the platform: ${outcome.score ?? "no score"}.${outcome.overall_feedback ? ` Feedback: ${outcome.overall_feedback}` : ""} Relay the platform's score — don't re-grade it. lms_my_exam_results has the per-question breakdown.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
