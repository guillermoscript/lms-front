-- Certificate auto-issuance never fired from the exam path (#671).
--
-- `calculate_course_completion()` decides "every exam passed" by joining
-- `exam_submissions` to `exam_scores`. But `save_exam_feedback()` — the only
-- writer on the student grading path — UPDATEs `exam_submissions.score` first
-- (which fires `trigger_auto_issue_cert_on_exam_score`) and INSERTs the
-- `exam_scores` row last. At trigger time there is no `exam_scores` row yet,
-- so `v_submitted_exams` is 0, the student is "not eligible", and nothing
-- fires again. A student who finishes every lesson and then passes the exam
-- never got the certificate automatically; only the reverse order (pass the
-- exam, then complete the last lesson) worked, because the lesson trigger ran
-- after the score row existed.
--
-- Fix: also try issuance whenever an `exam_scores` row is written or its score
-- changes. `issue_certificate_if_eligible()` is idempotent ("already issued"),
-- so the existing `exam_submissions` triggers can stay.

CREATE OR REPLACE FUNCTION public.on_exam_score_row_certificate_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_course_id INTEGER;
BEGIN
    IF NEW.score IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT course_id INTO v_course_id FROM public.exams WHERE exam_id = NEW.exam_id;
    IF v_course_id IS NOT NULL THEN
        PERFORM public.issue_certificate_if_eligible(NEW.student_id, v_course_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_issue_cert_on_exam_scores ON public.exam_scores;
CREATE TRIGGER trigger_auto_issue_cert_on_exam_scores
    AFTER INSERT OR UPDATE OF score ON public.exam_scores
    FOR EACH ROW
    EXECUTE FUNCTION public.on_exam_score_row_certificate_trigger();

COMMENT ON TRIGGER trigger_auto_issue_cert_on_exam_scores ON public.exam_scores IS
  'Issues the course certificate once the exam_scores row exists — the exam_submissions trigger fires before save_exam_feedback() writes it (#671).';
