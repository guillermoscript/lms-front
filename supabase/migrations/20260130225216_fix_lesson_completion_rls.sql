-- Fix lesson completion RLS policies
-- Allow students to mark their own lessons as complete

-- Drop existing policies if any
DROP POLICY IF EXISTS "Students can mark lessons complete" ON lesson_completions;
DROP POLICY IF EXISTS "Students can view own completions" ON lesson_completions;

-- Allow students to insert their own lesson completions
CREATE POLICY "Students can mark lessons complete"
ON lesson_completions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow students to view their own lesson completions
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
