-- Trigger function: check certificate eligibility after exam scoring
CREATE OR REPLACE FUNCTION public.on_exam_scored_certificate_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_course_id INTEGER;
BEGIN
    SELECT course_id INTO v_course_id FROM public.exams WHERE exam_id = NEW.exam_id;
    IF v_course_id IS NOT NULL THEN
        PERFORM public.issue_certificate_if_eligible(NEW.student_id, v_course_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire on INSERT when score is already set (auto-graded)
CREATE TRIGGER trigger_auto_issue_cert_on_exam_insert
    AFTER INSERT ON public.exam_submissions
    FOR EACH ROW WHEN (NEW.score IS NOT NULL)
    EXECUTE FUNCTION public.on_exam_scored_certificate_trigger();

-- Fire on UPDATE when score transitions NULL → value (AI-graded)
CREATE TRIGGER trigger_auto_issue_cert_on_exam_score
    AFTER UPDATE ON public.exam_submissions
    FOR EACH ROW WHEN (OLD.score IS NULL AND NEW.score IS NOT NULL)
    EXECUTE FUNCTION public.on_exam_scored_certificate_trigger();
