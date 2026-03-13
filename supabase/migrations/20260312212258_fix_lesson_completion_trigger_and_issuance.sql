-- =============================================================================
-- Fix lesson completion XP trigger and certificate issuance function
-- =============================================================================

-- 1. Fix handle_lesson_completion_xp: lesson_completions has no tenant_id column,
--    and lessons PK is 'id' not 'lesson_id'
CREATE OR REPLACE FUNCTION public.handle_lesson_completion_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- lesson_completions has no tenant_id — look up from lessons -> courses
  SELECT c.tenant_id INTO v_tenant_id
  FROM lessons l
  JOIN courses c ON c.course_id = l.course_id
  WHERE l.id = NEW.lesson_id;

  PERFORM award_xp(NEW.user_id, 'lesson_completion', 100, NEW.lesson_id::text, 'lesson', v_tenant_id);
  RETURN NEW;
END;
$function$;

-- 2. Fix issue_certificate_if_eligible: include credential_json (NOT NULL column)
--    and pull issuer_name + course title for the credential
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
  v_template_id UUID;
  v_tenant_id UUID;
  v_enrollment_id INTEGER;
  v_course_title TEXT;
  v_student_name TEXT;
  v_issuer_name TEXT;
BEGIN
  -- 1. Check eligibility using existing function
  v_readiness := public.check_and_issue_certificate(p_user_id, p_course_id);

  IF NOT (v_readiness->>'success')::BOOLEAN THEN
    RETURN v_readiness;
  END IF;

  -- 2. Get template for this course
  SELECT ct.template_id, ct.tenant_id, ct.issuer_name
  INTO v_template_id, v_tenant_id, v_issuer_name
  FROM public.certificate_templates ct
  WHERE ct.course_id = p_course_id
    AND ct.is_active = true
  LIMIT 1;

  IF v_template_id IS NULL THEN
    SELECT c.tenant_id INTO v_tenant_id FROM public.courses c WHERE c.course_id = p_course_id;
    RETURN jsonb_build_object('success', false, 'reason', 'No certificate template configured for this course');
  END IF;

  -- 3. Get enrollment_id
  SELECT e.enrollment_id INTO v_enrollment_id
  FROM public.enrollments e
  WHERE e.user_id = p_user_id
    AND e.course_id = p_course_id
    AND e.status = 'active'
  LIMIT 1;

  -- 4. Get course title and student name
  SELECT c.title INTO v_course_title FROM public.courses c WHERE c.course_id = p_course_id;
  SELECT COALESCE(p.full_name, p.username, 'Student') INTO v_student_name FROM public.profiles p WHERE p.id = p_user_id;

  -- 5. Generate verification code
  v_verification_code := public.generate_verification_code();

  -- 6. Insert certificate with credential_json
  INSERT INTO public.certificates (
    user_id, course_id, template_id, enrollment_id,
    verification_code, tenant_id, issued_at,
    completion_data, credential_json
  )
  VALUES (
    p_user_id, p_course_id, v_template_id, v_enrollment_id,
    v_verification_code, v_tenant_id, now(),
    v_readiness->'completion',
    jsonb_build_object(
      '@context', jsonb_build_array('https://www.w3.org/2018/credentials/v1'),
      'type', jsonb_build_array('VerifiableCredential', 'OpenBadgeCredential'),
      'issuer', jsonb_build_object('type', 'Profile', 'name', COALESCE(v_issuer_name, 'LMS Platform')),
      'issuanceDate', now()::text,
      'credentialSubject', jsonb_build_object(
        'type', 'AchievementSubject',
        'name', v_student_name,
        'achievement', jsonb_build_object('type', 'Achievement', 'name', COALESCE(v_course_title, 'Course'))
      )
    )
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
