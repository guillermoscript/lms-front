-- =============================================================================
-- Fix certificate_templates: add tenant_id, unique constraint, fix triggers
-- =============================================================================

-- 1. Add tenant_id column to certificate_templates
ALTER TABLE public.certificate_templates
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 2. Backfill tenant_id from courses table
UPDATE public.certificate_templates ct
SET tenant_id = c.tenant_id
FROM public.courses c
WHERE ct.course_id = c.course_id
  AND ct.tenant_id IS NULL;

-- 3. Make tenant_id NOT NULL after backfill
ALTER TABLE public.certificate_templates
  ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Add UNIQUE constraint on (course_id, tenant_id) for upsert support
ALTER TABLE public.certificate_templates
  ADD CONSTRAINT certificate_templates_course_tenant_unique
  UNIQUE (course_id, tenant_id);

-- 5. Add index for tenant_id lookups
CREATE INDEX IF NOT EXISTS idx_certificate_templates_tenant
  ON public.certificate_templates(tenant_id);

-- =============================================================================
-- Fix issue_certificate_if_eligible: wrong column name (id → template_id),
-- missing tenant_id on certificate insert
-- =============================================================================
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
BEGIN
  -- 1. Check eligibility using existing function
  v_readiness := public.check_and_issue_certificate(p_user_id, p_course_id);

  -- If success is false, it might be already issued or not eligible
  IF NOT (v_readiness->>'success')::BOOLEAN THEN
    RETURN v_readiness;
  END IF;

  -- 2. Get template for this course (use template_id, not id)
  SELECT template_id, tenant_id INTO v_template_id, v_tenant_id
  FROM public.certificate_templates
  WHERE course_id = p_course_id
    AND is_active = true
  LIMIT 1;

  IF v_template_id IS NULL THEN
    -- Fallback: get tenant_id from courses if no template
    SELECT tenant_id INTO v_tenant_id FROM public.courses WHERE course_id = p_course_id;

    RETURN jsonb_build_object('success', false, 'reason', 'No certificate template configured for this course');
  END IF;

  -- 3. Get enrollment_id for proper FK
  SELECT enrollment_id INTO v_enrollment_id
  FROM public.enrollments
  WHERE user_id = p_user_id
    AND course_id = p_course_id
    AND status = 'active'
  LIMIT 1;

  -- 4. Generate verification code
  v_verification_code := public.generate_verification_code();

  -- 5. Insert certificate with tenant_id
  INSERT INTO public.certificates (
    user_id,
    course_id,
    template_id,
    enrollment_id,
    verification_code,
    tenant_id,
    issued_at,
    completion_data
  )
  VALUES (
    p_user_id,
    p_course_id,
    v_template_id,
    v_enrollment_id,
    v_verification_code,
    v_tenant_id,
    now(),
    v_readiness->'completion'
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

-- =============================================================================
-- Update RLS policies for certificate_templates to use tenant_users + tenant_id
-- =============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Teachers can view templates for their courses" ON public.certificate_templates;
DROP POLICY IF EXISTS "Teachers can create templates for their courses" ON public.certificate_templates;
DROP POLICY IF EXISTS "Teachers can update their course templates" ON public.certificate_templates;

-- Students need to read templates (for certificate display)
DROP POLICY IF EXISTS "Students can view active templates" ON public.certificate_templates;

-- New policies using tenant_users (per-tenant roles)
CREATE POLICY "Teachers can view templates for their courses" ON public.certificate_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = certificate_templates.tenant_id
        AND tu.role IN ('teacher', 'admin')
        AND tu.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificate_templates.course_id
        AND c.author_id = auth.uid()
    )
  );

CREATE POLICY "Students can view active templates" ON public.certificate_templates
  FOR SELECT USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.course_id = certificate_templates.course_id
        AND e.status = 'active'
    )
  );

CREATE POLICY "Teachers can create templates for their courses" ON public.certificate_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = certificate_templates.tenant_id
        AND tu.role IN ('teacher', 'admin')
        AND tu.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificate_templates.course_id
        AND (c.author_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.tenant_users tu2
          WHERE tu2.user_id = auth.uid()
            AND tu2.tenant_id = certificate_templates.tenant_id
            AND tu2.role = 'admin'
            AND tu2.status = 'active'
        ))
    )
  );

CREATE POLICY "Teachers can update their course templates" ON public.certificate_templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = certificate_templates.tenant_id
        AND tu.role IN ('teacher', 'admin')
        AND tu.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificate_templates.course_id
        AND c.author_id = auth.uid()
    )
  );
