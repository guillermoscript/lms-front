-- Add missing DELETE policy on lesson_completions
-- Students need to be able to un-complete lessons (toggle)
CREATE POLICY "Students can delete own completions"
ON lesson_completions
FOR DELETE
USING (auth.uid() = user_id);
