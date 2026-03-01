-- Add AI grading prompt customization to exams
-- This allows teachers to customize the AI grading persona, tone, and feedback style

-- Add score and feedback columns to exam_submissions if they don't exist
ALTER TABLE exam_submissions
  ADD COLUMN IF NOT EXISTS score NUMERIC,
  ADD COLUMN IF NOT EXISTS feedback TEXT;

-- Create exam_ai_configs table
CREATE TABLE IF NOT EXISTS exam_ai_configs (
  config_id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL UNIQUE REFERENCES exams(exam_id) ON DELETE CASCADE,
  ai_grading_enabled BOOLEAN DEFAULT true,
  ai_grading_prompt TEXT,
  ai_persona VARCHAR(100) DEFAULT 'professional_educator',
  ai_feedback_tone VARCHAR(50) DEFAULT 'encouraging',
  ai_feedback_detail_level VARCHAR(50) DEFAULT 'detailed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment on table and columns
COMMENT ON TABLE exam_ai_configs IS 'AI grading configuration for exams';
COMMENT ON COLUMN exam_ai_configs.ai_grading_enabled IS 'Whether AI grading is enabled for this exam';
COMMENT ON COLUMN exam_ai_configs.ai_grading_prompt IS 'Custom prompt instructions for AI grading';
COMMENT ON COLUMN exam_ai_configs.ai_persona IS 'AI persona: professional_educator, friendly_tutor, strict_professor, supportive_mentor';
COMMENT ON COLUMN exam_ai_configs.ai_feedback_tone IS 'Feedback tone: encouraging, neutral, constructive, challenging';
COMMENT ON COLUMN exam_ai_configs.ai_feedback_detail_level IS 'Detail level: brief, moderate, detailed, comprehensive';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exam_ai_configs_exam_id ON exam_ai_configs(exam_id);

-- Add RLS policies for exam_ai_configs
ALTER TABLE exam_ai_configs ENABLE ROW LEVEL SECURITY;

-- Teachers can view/edit configs for their exams
CREATE POLICY "Teachers can manage AI configs for their exams"
  ON exam_ai_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams e
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.exam_id = exam_ai_configs.exam_id
        AND c.author_id = auth.uid()
    )
  );

-- Admins can manage all configs
CREATE POLICY "Admins can manage all AI configs"
  ON exam_ai_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Add grading rubric to exam_questions for free_text questions
ALTER TABLE exam_questions
  ADD COLUMN IF NOT EXISTS ai_grading_criteria TEXT,
  ADD COLUMN IF NOT EXISTS expected_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS max_length INTEGER;

-- Comment on columns
COMMENT ON COLUMN exam_questions.ai_grading_criteria IS 'Specific criteria for AI to evaluate free-text answers';
COMMENT ON COLUMN exam_questions.expected_keywords IS 'Key terms or concepts that should appear in the answer';
COMMENT ON COLUMN exam_questions.max_length IS 'Maximum length for free-text answers (characters)';

-- Enhance exam_submissions table for better AI tracking
ALTER TABLE exam_submissions
  ADD COLUMN IF NOT EXISTS ai_model_used VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ai_processing_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(3,2);

-- Comment on columns
COMMENT ON COLUMN exam_submissions.ai_model_used IS 'AI model used for grading (e.g., gemini-2.0-flash)';
COMMENT ON COLUMN exam_submissions.ai_processing_time_ms IS 'Time taken for AI to grade submission';
COMMENT ON COLUMN exam_submissions.ai_confidence_score IS 'AI confidence in grading (0.00-1.00)';

-- Create exam_question_scores table (for per-question scores)
CREATE TABLE IF NOT EXISTS exam_question_scores (
  score_id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES exam_submissions(submission_id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES exam_questions(question_id) ON DELETE CASCADE,
  student_answer TEXT,
  points_earned NUMERIC NOT NULL DEFAULT 0,
  points_possible NUMERIC NOT NULL,
  is_correct BOOLEAN,
  ai_feedback TEXT,
  ai_confidence NUMERIC(3,2),
  teacher_id UUID REFERENCES auth.users(id),
  teacher_notes TEXT,
  is_overridden BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, question_id)
);

-- Comment on table and columns
COMMENT ON TABLE exam_question_scores IS 'Individual question scores and feedback for exam submissions';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exam_question_scores_submission ON exam_question_scores(submission_id);
CREATE INDEX IF NOT EXISTS idx_exam_question_scores_question ON exam_question_scores(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_question_scores_overridden ON exam_question_scores(is_overridden);


-- Drop old version of save_exam_feedback function (different signature)
DROP FUNCTION IF EXISTS save_exam_feedback(INTEGER, INTEGER, UUID, JSONB, TEXT, NUMERIC);

-- Update the save_exam_feedback function to handle new structure
CREATE OR REPLACE FUNCTION save_exam_feedback(
  p_submission_id INTEGER,
  p_exam_id INTEGER,
  p_student_id UUID,
  p_answers JSONB,
  p_overall_feedback TEXT,
  p_score NUMERIC,
  p_question_feedback JSONB, -- New: { "question_id": { "feedback": "...", "points": 5, "is_correct": true } }
  p_ai_model VARCHAR(100) DEFAULT 'gemini-2.0-flash',
  p_processing_time_ms INTEGER DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_question_id INTEGER;
  v_feedback JSONB;
BEGIN
  -- Update exam submission with overall results
  UPDATE exam_submissions
  SET
    ai_data = jsonb_build_object(
      'overall_feedback', p_overall_feedback,
      'question_feedback', p_question_feedback,
      'graded_at', NOW()
    ),
    score = p_score,
    evaluated_at = NOW(),
    review_status = 'ai_reviewed',
    ai_model_used = p_ai_model,
    ai_processing_time_ms = p_processing_time_ms
  WHERE submission_id = p_submission_id AND student_id = p_student_id;

  -- Insert individual question scores
  FOR v_question_id, v_feedback IN
    SELECT
      (key::INTEGER),
      value
    FROM jsonb_each(p_question_feedback)
  LOOP
    INSERT INTO exam_question_scores (
      submission_id,
      question_id,
      student_answer,
      points_earned,
      points_possible,
      is_correct,
      ai_feedback,
      ai_confidence
    ) VALUES (
      p_submission_id,
      v_question_id,
      (v_feedback->>'student_answer')::TEXT,
      (v_feedback->>'points_earned')::NUMERIC,
      (v_feedback->>'points_possible')::NUMERIC,
      (v_feedback->>'is_correct')::BOOLEAN,
      (v_feedback->>'feedback')::TEXT,
      (v_feedback->>'confidence')::NUMERIC
    )
    ON CONFLICT (submission_id, question_id)
    DO UPDATE SET
      points_earned = EXCLUDED.points_earned,
      ai_feedback = EXCLUDED.ai_feedback,
      ai_confidence = EXCLUDED.ai_confidence,
      updated_at = NOW();
  END LOOP;

  -- Update overall exam_scores for compatibility
  INSERT INTO exam_scores (submission_id, student_id, exam_id, score, feedback)
  VALUES (p_submission_id, p_student_id, p_exam_id, p_score, p_overall_feedback)
  ON CONFLICT (submission_id, student_id, exam_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    feedback = EXCLUDED.feedback,
    evaluated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION save_exam_feedback TO authenticated;

-- Create function for teacher to override AI scores
CREATE OR REPLACE FUNCTION override_exam_score(
  p_score_id INTEGER,
  p_teacher_id UUID,
  p_new_points NUMERIC,
  p_teacher_notes TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE exam_question_scores
  SET
    points_earned = p_new_points,
    teacher_id = p_teacher_id,
    teacher_notes = p_teacher_notes,
    is_overridden = true,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE score_id = p_score_id;

  -- Update submission review status
  UPDATE exam_submissions
  SET review_status = 'teacher_reviewed'
  WHERE submission_id = (SELECT submission_id FROM exam_question_scores WHERE score_id = p_score_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION override_exam_score TO authenticated;

-- Add RLS policies for exam_question_scores
ALTER TABLE exam_question_scores ENABLE ROW LEVEL SECURITY;

-- Students can view their own scores
CREATE POLICY "Students can view their own exam question scores"
  ON exam_question_scores
  FOR SELECT
  TO authenticated
  USING (
    submission_id IN (
      SELECT submission_id FROM exam_submissions WHERE student_id = auth.uid()
    )
  );

-- Teachers can view scores for their courses
CREATE POLICY "Teachers can view exam question scores for their courses"
  ON exam_question_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exam_submissions es
      JOIN exams e ON es.exam_id = e.exam_id
      JOIN courses c ON e.course_id = c.course_id
      WHERE es.submission_id = exam_question_scores.submission_id
        AND c.author_id = auth.uid()
    )
  );

-- Teachers can update scores for their courses
CREATE POLICY "Teachers can override exam question scores for their courses"
  ON exam_question_scores
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exam_submissions es
      JOIN exams e ON es.exam_id = e.exam_id
      JOIN courses c ON e.course_id = c.course_id
      WHERE es.submission_id = exam_question_scores.submission_id
        AND c.author_id = auth.uid()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can manage all exam question scores"
  ON exam_question_scores
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
