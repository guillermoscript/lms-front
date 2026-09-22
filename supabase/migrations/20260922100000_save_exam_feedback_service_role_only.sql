-- #839: save_exam_feedback is service-role only.
--
-- It is SECURITY DEFINER and trusts every argument: score, per-question
-- points, and a submission id it never checks against the caller. It was
-- granted to `authenticated` (20260202000000), and through PUBLIC to `anon`
-- too, so any caller could hand themselves 100% on their own submission, or
-- write question scores onto someone else's. The certificate trigger on
-- exam_scores (20260906120000) turns that score into a certificate.
--
-- Grading now runs entirely server-side (lib/exams/grade.ts, reached through
-- the gradeExamWithAI action and POST /api/exams/[examId]/grade) and writes
-- through the service role.

REVOKE EXECUTE ON FUNCTION public.save_exam_feedback(
  integer, integer, uuid, jsonb, text, numeric, jsonb, character varying, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_exam_feedback(
  integer, integer, uuid, jsonb, text, numeric, jsonb, character varying, integer
) TO service_role;
