-- Fix Lesson Completions RLS Policies
-- This migration adds the missing INSERT policy that allows students to mark lessons as complete

-- Drop existing policies if they exist (to recreate them cleanly)
DROP POLICY IF EXISTS "Students can mark lessons complete" ON lesson_completions;
DROP POLICY IF EXISTS "Students can view own completions" ON lesson_completions;
DROP POLICY IF EXISTS "Teachers and admins view all completions" ON lesson_completions;

-- Enable RLS
ALTER TABLE lesson_completions ENABLE ROW LEVEL SECURITY;

-- Allow students to INSERT lesson completions (CRITICAL FIX)
CREATE POLICY "Students can mark lessons complete"
ON lesson_completions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow students to view their own completions
CREATE POLICY "Students can view own completions"
ON lesson_completions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow teachers and admins to view all completions
CREATE POLICY "Teachers and admins view all completions"
ON lesson_completions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('teacher', 'admin')
  )
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_lesson
ON lesson_completions(user_id, lesson_id);
