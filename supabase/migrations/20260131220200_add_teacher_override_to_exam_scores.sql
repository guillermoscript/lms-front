-- Add teacher override fields to exam scores
ALTER TABLE exam_scores
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS teacher_notes TEXT,
  ADD COLUMN IF NOT EXISTS is_overridden BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Add review status to submissions
ALTER TABLE exam_submissions
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'ai_reviewed', 'teacher_reviewed'
  ADD COLUMN IF NOT EXISTS requires_attention BOOLEAN DEFAULT false;

-- Index for filtering submissions
CREATE INDEX IF NOT EXISTS idx_exam_submissions_review_status ON exam_submissions(review_status);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_requires_attention ON exam_submissions(requires_attention);
