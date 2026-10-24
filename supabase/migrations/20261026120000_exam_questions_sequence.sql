-- The exam builder used to save by deleting every question of the exam and
-- re-inserting it, so question order was simply question_id order. That
-- delete cascaded to exam_answers, exam_question_scores, exam_grading_secrets
-- and question_options, and gave every question a new id (orphaning the exam
-- grading tests in ai_eval_cases). The builder now updates kept questions in
-- place, so the order the teacher drags them into needs its own column.
--
-- NULL = no position set (questions added by other writers, e.g. the MCP
-- lms_add_exam_question tool): readers order by sequence NULLS LAST, then
-- question_id, which appends them as before.

ALTER TABLE public.exam_questions ADD COLUMN sequence integer;

COMMENT ON COLUMN public.exam_questions.sequence IS
  'Position of the question in its exam (1-based). NULL sorts last; ties break on question_id.';

-- A data backfill should not go through the grading-secrets split trigger.
ALTER TABLE public.exam_questions DISABLE TRIGGER USER;

UPDATE public.exam_questions q
SET sequence = ranked.rn
FROM (
  SELECT question_id, row_number() OVER (PARTITION BY exam_id ORDER BY question_id) AS rn
  FROM public.exam_questions
) ranked
WHERE ranked.question_id = q.question_id;

ALTER TABLE public.exam_questions ENABLE TRIGGER USER;
