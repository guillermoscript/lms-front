-- Logic to actually ISSUE a certificate if eligible
CREATE OR REPLACE FUNCTION public.issue_certificate_if_eligible(
  p_user_id UUID,
  p_course_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_readiness JSONB;
  v_new_cert_id UUID;
  v_verification_code TEXT;
  v_template_id BIGINT;
BEGIN
  -- 1. Check eligibility using existing function
  v_readiness := public.check_and_issue_certificate(p_user_id, p_course_id);
  
  -- If success is false, it might be already issued or not eligible
  IF NOT (v_readiness->>'success')::BOOLEAN THEN
    RETURN v_readiness;
  END IF;

  -- 2. Get template for this course
  SELECT id INTO v_template_id 
  FROM public.certificate_templates 
  WHERE course_id = p_course_id 
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No certificate template configured for this course');
  END IF;

  -- 3. Actually issue the certificate
  v_verification_code := public.generate_verification_code();
  
  INSERT INTO public.certificates (
    user_id,
    course_id,
    template_id,
    verification_code,
    pdf_url
  )
  VALUES (
    p_user_id, 
    p_course_id, 
    v_template_id, 
    v_verification_code,
    'https://dykoxndisvttzrvononl.supabase.co/storage/v1/object/public/certificates/mock-cert-' || v_verification_code || '.pdf'
  )
  RETURNING certificate_id INTO v_new_cert_id;

  RETURN jsonb_build_object(
    'success', true, 
    'certificateId', v_new_cert_id,
    'verificationCode', v_verification_code,
    'message', 'Certificate issued automatically'
  );
END;
$$;

-- Trigger function for automated issuance on lesson completion
CREATE OR REPLACE FUNCTION public.on_lesson_completed_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_course_id INTEGER;
BEGIN
    -- Get course_id for the lesson
    SELECT course_id INTO v_course_id FROM public.lessons WHERE id = NEW.lesson_id;
    
    -- Try to issue certificate (function handles eligibility check)
    PERFORM public.issue_certificate_if_eligible(NEW.user_id, v_course_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to lesson_completions
DROP TRIGGER IF EXISTS trigger_auto_issue_on_lesson_completion ON public.lesson_completions;
CREATE TRIGGER trigger_auto_issue_on_lesson_completion
    AFTER INSERT ON public.lesson_completions
    FOR EACH ROW
    EXECUTE FUNCTION public.on_lesson_completed_trigger();
