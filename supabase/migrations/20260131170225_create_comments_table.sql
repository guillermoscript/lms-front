-- Create Comments Table
-- This table stores student comments on lessons

-- Create the comments table
CREATE TABLE IF NOT EXISTS comments (
  comment_id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Students can view comments on lessons in courses they're enrolled in
CREATE POLICY "Students can view comments on enrolled courses"
ON comments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM enrollments e
    JOIN lessons l ON l.course_id = e.course_id
    WHERE l.id = comments.lesson_id
    AND e.user_id = auth.uid()
    AND e.status = 'active'
  )
);

-- Teachers and admins can view all comments
CREATE POLICY "Teachers and admins can view all comments"
ON comments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('teacher', 'admin')
  )
);

-- Students can post comments on lessons in courses they're enrolled in
CREATE POLICY "Students can post comments"
ON comments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM enrollments e
    JOIN lessons l ON l.course_id = e.course_id
    WHERE l.id = lesson_id
    AND e.user_id = auth.uid()
    AND e.status = 'active'
  )
);

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
ON comments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
ON comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_lesson_id ON comments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_comments_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_comments_updated_at();
