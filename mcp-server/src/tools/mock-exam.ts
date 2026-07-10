import { z } from "zod";
import type { MCPServer } from "mcp-use/server";
import { LmsSession } from "../session.js";
import { ok, errorResult } from "../format.js";

/**
 * Mock-exam source tool (Epic #348 Phase 2, issue #364). Feeds the
 * `mock-exam` prompt real misses from a student's OWN submitted exams so the
 * host can author a fresh variation exam and re-test them.
 *
 * Hard guardrail: this exposes grading-sensitive fields (correct answers,
 * rubrics, keyword lists) that are normally withheld from students — that is
 * only safe here because the student has ALREADY submitted and seen the
 * results for these specific questions. The carve-out must be enforced by the
 * QUERY (starting from the caller's own `exam_submissions` rows and joining
 * outward), never merely by prompt wording, because `exam_questions` /
 * `exam_question_scores` / `question_options` have no tenant_id and their RLS
 * SELECT policies are `USING (true)` for any authenticated user.
 */

const MISS_RATIO_THRESHOLD = 0.7;

interface ExamEmbed {
  title: string;
  course_id: number;
  courses: { title: string } | null;
}

interface SubmissionRow {
  submission_id: number;
  exam_id: number;
  score: number | null;
  submission_date: string;
  exams: ExamEmbed;
}

interface QuestionEmbed {
  question_id: number;
  question_text: string;
  question_type: string;
  points: number | null;
  correct_answer: string | null;
  grading_rubric: string | null;
  ai_grading_criteria: string | null;
  expected_keywords: string[] | null;
}

interface ScoreRow {
  submission_id: number;
  question_id: number;
  student_answer: string | null;
  points_earned: number | null;
  points_possible: number | null;
  is_correct: boolean | null;
  ai_feedback: string | null;
  exam_questions: QuestionEmbed | null;
}

export function registerMockExamTools(server: MCPServer) {
  // ── lms_get_mock_exam_source ────────────────────────────────────────────────
  server.tool(
    {
      name: "lms_get_mock_exam_source",
      description:
        "Fetch the caller's missed/weak questions from their OWN already-submitted exams, with rubrics and correct answers, so you can author a mock variation exam. ONLY covers exams the caller has actually submitted — an exam_id they never took returns an empty result, never its questions.",
      schema: z.object({
        course_id: z
          .number()
          .optional()
          .describe(
            "Limit to submitted exams within this course. Omit both filters to pull across all of the caller's submitted exams."
          ),
        exam_id: z
          .number()
          .optional()
          .describe(
            "Limit to one specific exam. Must be an exam the caller has already submitted, else the result is empty — never falls back to showing its questions."
          ),
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
        const supabase = session.getClient();
        const userId = session.getUserId();
        const tenantId = session.getTenantId();

        // Start from the caller's OWN submissions — this is the carve-out
        // boundary. exams!inner so a course_id filter on the embed actually
        // restricts the parent rows (PostgREST embedded-filter requirement).
        let query = supabase
          .from("exam_submissions")
          .select(
            "submission_id, exam_id, score, submission_date, exams!inner(title, course_id, courses(title))"
          )
          .eq("student_id", userId)
          .eq("tenant_id", tenantId)
          .order("submission_date", { ascending: false })
          .limit(50);

        if (input.exam_id !== undefined) query = query.eq("exam_id", input.exam_id);
        if (input.course_id !== undefined)
          query = query.eq("exams.course_id", input.course_id);

        const subsRes = await query;
        if (subsRes.error)
          return errorResult(`Loading exam submissions: ${subsRes.error.message}`);

        // Retakes are allowed — dedupe to the freshest submission per exam
        // (rows already ordered newest-first).
        const seenExamIds = new Set<number>();
        const submissions = ((subsRes.data ?? []) as unknown as SubmissionRow[]).filter(
          (s) => {
            if (seenExamIds.has(s.exam_id)) return false;
            seenExamIds.add(s.exam_id);
            return true;
          }
        );

        if (submissions.length === 0) {
          return ok(
            { source_exams: [], total_weak_questions: 0 },
            input.exam_id !== undefined
              ? `You have not submitted exam ${input.exam_id} — no mock-exam source available for it.`
              : "No submitted exams found to build a mock exam from."
          );
        }

        const submissionIds = submissions.map((s) => s.submission_id);

        // exam_question_scores/exam_questions have NO tenant_id — scoped here
        // only via submission_id IN (the caller's own submissions above).
        const scoresRes = await supabase
          .from("exam_question_scores")
          .select(
            "submission_id, question_id, student_answer, points_earned, points_possible, is_correct, ai_feedback, exam_questions(question_id, question_text, question_type, points, correct_answer, grading_rubric, ai_grading_criteria, expected_keywords)"
          )
          .in("submission_id", submissionIds);
        if (scoresRes.error)
          return errorResult(
            `Loading exam question scores: ${scoresRes.error.message}`
          );

        const misses = ((scoresRes.data ?? []) as unknown as ScoreRow[]).filter(
          (s) => {
            const possible =
              s.points_possible !== null ? Number(s.points_possible) : 0;
            const earned = s.points_earned !== null ? Number(s.points_earned) : 0;
            return (
              s.is_correct === false ||
              (possible > 0 && earned / possible < MISS_RATIO_THRESHOLD)
            );
          }
        );

        // Options are only needed for multiple_choice misses — question_options
        // has no tenant_id either, but the question_ids here are derived
        // exclusively from the join above, never from caller input.
        const mcQuestionIds = Array.from(
          new Set(
            misses
              .filter((m) => m.exam_questions?.question_type === "multiple_choice")
              .map((m) => m.question_id)
          )
        );
        const optionsByQuestion = new Map<
          number,
          Array<{ option_id: number; option_text: string; is_correct: boolean }>
        >();
        if (mcQuestionIds.length > 0) {
          const optionsRes = await supabase
            .from("question_options")
            .select("option_id, question_id, option_text, is_correct")
            .in("question_id", mcQuestionIds);
          if (optionsRes.error)
            return errorResult(
              `Loading answer options: ${optionsRes.error.message}`
            );
          for (const opt of optionsRes.data ?? []) {
            const list = optionsByQuestion.get(opt.question_id) ?? [];
            list.push({
              option_id: opt.option_id,
              option_text: opt.option_text,
              is_correct: opt.is_correct,
            });
            optionsByQuestion.set(opt.question_id, list);
          }
        }

        const missesBySubmission = new Map<number, ScoreRow[]>();
        for (const m of misses) {
          const list = missesBySubmission.get(m.submission_id) ?? [];
          list.push(m);
          missesBySubmission.set(m.submission_id, list);
        }

        const sourceExams = submissions
          .map((sub) => {
            const subMisses = missesBySubmission.get(sub.submission_id) ?? [];
            if (subMisses.length === 0) return null;
            return {
              exam_id: sub.exam_id,
              exam_title: sub.exams.title,
              course_id: sub.exams.course_id,
              course_title: sub.exams.courses?.title ?? null,
              submission_id: sub.submission_id,
              submission_date: sub.submission_date,
              score: sub.score !== null ? Number(sub.score) : null,
              weak_questions: subMisses.map((m) => {
                const q = m.exam_questions;
                return {
                  question_id: m.question_id,
                  question_text: q?.question_text ?? "",
                  question_type: q?.question_type ?? null,
                  points: q?.points ?? null,
                  correct_answer: q?.correct_answer ?? null,
                  grading_rubric: q?.grading_rubric ?? null,
                  ai_grading_criteria: q?.ai_grading_criteria ?? null,
                  expected_keywords: q?.expected_keywords ?? null,
                  options:
                    q?.question_type === "multiple_choice"
                      ? optionsByQuestion.get(m.question_id) ?? []
                      : undefined,
                  your_answer: m.student_answer,
                  your_feedback: m.ai_feedback,
                  points_earned:
                    m.points_earned !== null ? Number(m.points_earned) : null,
                  points_possible:
                    m.points_possible !== null ? Number(m.points_possible) : null,
                };
              }),
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);

        const totalWeak = sourceExams.reduce(
          (sum, e) => sum + e.weak_questions.length,
          0
        );

        return ok(
          { source_exams: sourceExams, total_weak_questions: totalWeak },
          sourceExams.length === 0
            ? input.exam_id !== undefined
              ? `You submitted exam ${input.exam_id} but had no missed/weak questions on it — nothing to build a mock exam from.`
              : "No missed or weak questions found in your submitted exams — nothing to build a mock exam from."
            : `Found ${totalWeak} weak/missed question(s) across ${sourceExams.length} submitted exam(s). Author fresh variations of these — never reuse the real question text verbatim.`
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
