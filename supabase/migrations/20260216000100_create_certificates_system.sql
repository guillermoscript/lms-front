-- Migration: Create Certificates System
-- Description: Implements Open Badges 3.0 compliant certificate system
-- Tables: certificate_templates, certificates, issuer_keys, certificate_shares, certificate_verification_log
-- Functions: calculate_course_completion, generate_verification_code, check_and_issue_certificate

-- =====================================================
-- 1. CREATE TABLES
-- =====================================================

-- Certificate Templates Table
-- Defines certificate requirements and design per course
CREATE TABLE IF NOT EXISTS public.certificate_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id INTEGER REFERENCES public.courses(course_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Completion Criteria
  min_lesson_completion_pct INTEGER DEFAULT 100 CHECK (min_lesson_completion_pct >= 0 AND min_lesson_completion_pct <= 100),
  min_exam_pass_score INTEGER DEFAULT 70 CHECK (min_exam_pass_score >= 0 AND min_exam_pass_score <= 100),
  requires_all_exams BOOLEAN DEFAULT true,
  required_lesson_ids INTEGER[], -- Optional: specific lessons that must be completed
  required_exam_ids INTEGER[], -- Optional: specific exams that must be passed
  
  -- Certificate Validity
  expiration_days INTEGER, -- NULL = never expires
  allow_revocation BOOLEAN DEFAULT true,
  
  -- Open Badges 3.0 Fields
  achievement_type VARCHAR(100) DEFAULT 'Certificate', -- 'Certificate', 'Badge', 'Degree', etc.
  achievement_criteria_narrative TEXT, -- Human-readable criteria description
  tags TEXT[], -- Tags for categorization
  alignment_targets JSONB, -- Links to external skill frameworks
  
  -- Certificate Design
  design_config JSONB, -- Colors, fonts, layout preferences
  logo_url TEXT,
  signature_image_url TEXT,
  signature_name VARCHAR(255),
  signature_title VARCHAR(255),
  custom_fields JSONB, -- Additional custom fields
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Create indexes for certificate_templates
CREATE INDEX idx_certificate_templates_course ON public.certificate_templates(course_id);
CREATE INDEX idx_certificate_templates_active ON public.certificate_templates(is_active);

-- Add comment
COMMENT ON TABLE public.certificate_templates IS 'Certificate templates defining completion criteria and design per course';

-- =====================================================

-- Certificates Table
-- Stores issued certificates (Open Badges 3.0 AchievementCredentials)
CREATE TABLE IF NOT EXISTS public.certificates (
  certificate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core References
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES public.courses(course_id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.certificate_templates(template_id) ON DELETE SET NULL,
  enrollment_id INTEGER REFERENCES public.enrollments(enrollment_id) ON DELETE SET NULL,
  
  -- Verification
  verification_code VARCHAR(32) UNIQUE NOT NULL,
  
  -- Open Badges 3.0 Verifiable Credential
  credential_json JSONB NOT NULL, -- Complete Open Badges 3.0 AchievementCredential (JSON-LD)
  credential_jwt TEXT, -- JWT-encoded version (VC-JWT format)
  
  -- Issuance Details
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL if never expires
  
  -- Revocation
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  revoked_by UUID REFERENCES public.profiles(id),
  
  -- Completion Snapshot (for historical record)
  completion_data JSONB NOT NULL, -- Snapshot of lessons completed, exam scores, evidence
  
  -- File References
  pdf_url TEXT, -- URL to generated PDF certificate
  badge_image_url TEXT, -- URL to digital badge (PNG/SVG with baked metadata)
  
  -- Metadata
  blockchain_anchor_id TEXT, -- Optional: blockchain transaction ID if anchored
  share_count INTEGER DEFAULT 0, -- Track how many times shared
  view_count INTEGER DEFAULT 0, -- Track verification page views
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for certificates
CREATE INDEX idx_certificates_user ON public.certificates(user_id);
CREATE INDEX idx_certificates_course ON public.certificates(course_id);
CREATE INDEX idx_certificates_verification ON public.certificates(verification_code);
CREATE INDEX idx_certificates_issued ON public.certificates(issued_at);
CREATE INDEX idx_certificates_expires ON public.certificates(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_certificates_active ON public.certificates(user_id, course_id) WHERE revoked_at IS NULL;

-- Add comment
COMMENT ON TABLE public.certificates IS 'Issued certificates with Open Badges 3.0 verifiable credentials';

-- =====================================================

-- Issuer Keys Table
-- Cryptographic keys for signing Open Badges 3.0 credentials
CREATE TABLE IF NOT EXISTS public.issuer_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Key Identity
  key_name VARCHAR(255) NOT NULL,
  key_type VARCHAR(50) NOT NULL, -- 'Ed25519', 'RSA', 'secp256k1'
  
  -- Public Key (stored for verification)
  public_key TEXT NOT NULL,
  public_key_jwk JSONB, -- JSON Web Key format
  public_key_multibase TEXT, -- Multibase-encoded public key
  
  -- Key URL (dereferencing)
  key_url TEXT UNIQUE NOT NULL, -- e.g., "https://lms.example.com/keys/1"
  
  -- Private Key (ENCRYPTED!)
  private_key_encrypted TEXT NOT NULL, -- Encrypted with app secret
  encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
  
  -- Key Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  
  -- Usage Tracking
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true
);

-- Create indexes for issuer_keys
CREATE INDEX idx_issuer_keys_active ON public.issuer_keys(is_active);
CREATE INDEX idx_issuer_keys_url ON public.issuer_keys(key_url);

-- Add comment
COMMENT ON TABLE public.issuer_keys IS 'Cryptographic keys for signing Open Badges 3.0 credentials';

-- =====================================================

-- Certificate Shares Table
-- Track when students share certificates
CREATE TABLE IF NOT EXISTS public.certificate_shares (
  share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID REFERENCES public.certificates(certificate_id) ON DELETE CASCADE,
  
  -- Share Details
  platform VARCHAR(50), -- 'linkedin', 'twitter', 'facebook', 'email', 'direct_link'
  share_url TEXT, -- The URL that was shared
  
  -- Tracking
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  
  -- Optional: Track who viewed the share
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);

-- Create indexes for certificate_shares
CREATE INDEX idx_certificate_shares_cert ON public.certificate_shares(certificate_id);
CREATE INDEX idx_certificate_shares_platform ON public.certificate_shares(platform);
CREATE INDEX idx_certificate_shares_date ON public.certificate_shares(shared_at);

-- Add comment
COMMENT ON TABLE public.certificate_shares IS 'Track certificate sharing activity for analytics';

-- =====================================================

-- Certificate Verification Log Table
-- Audit log for verification attempts
CREATE TABLE IF NOT EXISTS public.certificate_verification_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID REFERENCES public.certificates(certificate_id) ON DELETE SET NULL,
  verification_code VARCHAR(32),
  
  -- Verification Result
  verification_status VARCHAR(50), -- 'valid', 'expired', 'revoked', 'not_found'
  
  -- Request Details
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  country_code VARCHAR(2), -- GeoIP lookup
  
  -- Performance
  response_time_ms INTEGER
);

-- Create indexes for certificate_verification_log
CREATE INDEX idx_verification_log_cert ON public.certificate_verification_log(certificate_id);
CREATE INDEX idx_verification_log_code ON public.certificate_verification_log(verification_code);
CREATE INDEX idx_verification_log_date ON public.certificate_verification_log(verified_at);
CREATE INDEX idx_verification_log_status ON public.certificate_verification_log(verification_status);

-- Add comment
COMMENT ON TABLE public.certificate_verification_log IS 'Audit log for certificate verification attempts';

-- =====================================================
-- 2. CREATE FUNCTIONS
-- =====================================================

-- Function: calculate_course_completion
-- Calculates if student meets certificate criteria
CREATE OR REPLACE FUNCTION public.calculate_course_completion(
  p_user_id UUID,
  p_course_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_lessons INTEGER;
  v_completed_lessons INTEGER;
  v_completion_pct NUMERIC;
  v_total_exams INTEGER;
  v_submitted_exams INTEGER;
  v_avg_score NUMERIC;
  v_all_exams_passed BOOLEAN;
  v_eligible BOOLEAN := false;
  v_template RECORD;
  v_result JSONB;
BEGIN
  -- Get certificate template for course
  SELECT * INTO v_template
  FROM public.certificate_templates
  WHERE course_id = p_course_id AND is_active = true
  LIMIT 1;
  
  -- If no template, return not eligible
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'No active certificate template for this course'
    );
  END IF;
  
  -- Count total published lessons
  SELECT COUNT(*) INTO v_total_lessons
  FROM public.lessons
  WHERE course_id = p_course_id AND status = 'published';
  
  -- Count completed lessons
  SELECT COUNT(DISTINCT lc.lesson_id) INTO v_completed_lessons
  FROM public.lesson_completions lc
  JOIN public.lessons l ON lc.lesson_id = l.id
  WHERE lc.user_id = p_user_id 
    AND l.course_id = p_course_id 
    AND l.status = 'published';
  
  -- Calculate completion percentage
  IF v_total_lessons > 0 THEN
    v_completion_pct := (v_completed_lessons::NUMERIC / v_total_lessons::NUMERIC) * 100;
  ELSE
    v_completion_pct := 0;
  END IF;
  
  -- Count total published exams
  SELECT COUNT(*) INTO v_total_exams
  FROM public.exams
  WHERE course_id = p_course_id AND status = 'published';
  
  -- Count submitted exams with scores
  SELECT 
    COUNT(DISTINCT es.exam_id),
    AVG(esc.score),
    BOOL_AND(esc.score >= v_template.min_exam_pass_score)
  INTO v_submitted_exams, v_avg_score, v_all_exams_passed
  FROM public.exam_submissions es
  JOIN public.exam_scores esc ON es.submission_id = esc.submission_id
  JOIN public.exams e ON es.exam_id = e.exam_id
  WHERE es.student_id = p_user_id 
    AND e.course_id = p_course_id 
    AND e.status = 'published';
  
  -- Check eligibility based on template criteria
  v_eligible := (
    v_completion_pct >= v_template.min_lesson_completion_pct
    AND (
      (v_template.requires_all_exams = true AND v_submitted_exams = v_total_exams AND v_all_exams_passed)
      OR (v_template.requires_all_exams = false AND v_avg_score >= v_template.min_exam_pass_score)
    )
  );
  
  -- Build result
  v_result := jsonb_build_object(
    'eligible', v_eligible,
    'completionPercentage', ROUND(v_completion_pct, 2),
    'totalLessons', v_total_lessons,
    'completedLessons', v_completed_lessons,
    'totalExams', v_total_exams,
    'submittedExams', v_submitted_exams,
    'averageExamScore', COALESCE(ROUND(v_avg_score, 2), 0),
    'allExamsPassed', COALESCE(v_all_exams_passed, false),
    'criteria', jsonb_build_object(
      'minLessonCompletionPct', v_template.min_lesson_completion_pct,
      'minExamPassScore', v_template.min_exam_pass_score,
      'requiresAllExams', v_template.requires_all_exams
    )
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_course_completion IS 'Calculates if student meets certificate criteria for a course';

-- =====================================================

-- Function: generate_verification_code
-- Generates unique verification code for certificates
CREATE OR REPLACE FUNCTION public.generate_verification_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate random 20-character alphanumeric code
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 20));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.certificates WHERE verification_code = v_code) INTO v_exists;
    
    -- If unique, exit loop
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.generate_verification_code IS 'Generates unique 20-character verification code for certificates';

-- =====================================================

-- Function: check_and_issue_certificate
-- Checks eligibility and returns readiness status
CREATE OR REPLACE FUNCTION public.check_and_issue_certificate(
  p_user_id UUID,
  p_course_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_completion JSONB;
  v_eligible BOOLEAN;
  v_existing_cert UUID;
  v_result JSONB;
BEGIN
  -- Check if already has valid certificate
  SELECT certificate_id INTO v_existing_cert
  FROM public.certificates
  WHERE user_id = p_user_id 
    AND course_id = p_course_id 
    AND revoked_at IS NULL
  LIMIT 1;
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'Certificate already issued',
      'certificateId', v_existing_cert
    );
  END IF;
  
  -- Calculate completion
  v_completion := public.calculate_course_completion(p_user_id, p_course_id);
  v_eligible := (v_completion->>'eligible')::BOOLEAN;
  
  IF NOT v_eligible THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'Not eligible for certificate',
      'completion', v_completion
    );
  END IF;
  
  -- Return readiness status
  RETURN jsonb_build_object(
    'success', true,
    'eligible', true,
    'completion', v_completion,
    'message', 'Ready to issue certificate'
  );
END;
$$;

COMMENT ON FUNCTION public.check_and_issue_certificate IS 'Checks if student is eligible for certificate issuance';

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issuer_keys ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- certificate_templates policies
-- =====================================================

-- Teachers can view templates for their courses
CREATE POLICY "Teachers can view templates for their courses" ON public.certificate_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('teacher', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificate_templates.course_id
        AND c.author_id = auth.uid()
    )
  );

-- Teachers can create templates for their courses
CREATE POLICY "Teachers can create templates for their courses" ON public.certificate_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('teacher', 'admin')
    )
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificate_templates.course_id
        AND c.author_id = auth.uid()
    )
  );

-- Teachers can update their course templates
CREATE POLICY "Teachers can update their course templates" ON public.certificate_templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('teacher', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificate_templates.course_id
        AND c.author_id = auth.uid()
    )
  );

-- =====================================================
-- certificates policies
-- =====================================================

-- Students can view their own certificates
CREATE POLICY "Students can view their own certificates" ON public.certificates
  FOR SELECT USING (user_id = auth.uid());

-- Teachers can view certificates for their courses
CREATE POLICY "Teachers can view certificates for their courses" ON public.certificates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('teacher', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificates.course_id
        AND c.author_id = auth.uid()
    )
  );

-- System can insert certificates (via service role)
CREATE POLICY "System can insert certificates" ON public.certificates
  FOR INSERT WITH CHECK (true);

-- Teachers can revoke certificates for their courses
CREATE POLICY "Teachers can revoke certificates" ON public.certificates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('teacher', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = certificates.course_id
        AND c.author_id = auth.uid()
    )
  );

-- =====================================================
-- certificate_shares policies
-- =====================================================

-- Users can create shares for their certificates
CREATE POLICY "Users can create shares for their certificates" ON public.certificate_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.certificates c
      WHERE c.certificate_id = certificate_shares.certificate_id
        AND c.user_id = auth.uid()
    )
  );

-- Users can view their certificate shares
CREATE POLICY "Users can view their certificate shares" ON public.certificate_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.certificates c
      WHERE c.certificate_id = certificate_shares.certificate_id
        AND c.user_id = auth.uid()
    )
  );

-- =====================================================
-- issuer_keys policies (HIGHLY RESTRICTED)
-- =====================================================

-- Only admins can view issuer keys
CREATE POLICY "Only admins can view issuer keys" ON public.issuer_keys
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Only admins can manage issuer keys
CREATE POLICY "Only admins can manage issuer keys" ON public.issuer_keys
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- =====================================================
-- certificate_verification_log policies
-- =====================================================

-- Public can insert verification logs (via API)
CREATE POLICY "Public can insert verification logs" ON public.certificate_verification_log
  FOR INSERT WITH CHECK (true);

-- Only admins can view verification logs
CREATE POLICY "Only admins can view verification logs" ON public.certificate_verification_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- =====================================================
-- 4. TRIGGERS
-- =====================================================

-- Update updated_at timestamp on certificate_templates
CREATE TRIGGER update_certificate_templates_updated_at
  BEFORE UPDATE ON public.certificate_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update updated_at timestamp on certificates
CREATE TRIGGER update_certificates_updated_at
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
