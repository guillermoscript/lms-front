-- #425: real learning objectives + estimated duration on courses.
-- The public course page previously fabricated both ("What you'll learn" from
-- the first 6 lesson descriptions, duration as lesson count × 10 minutes).
-- Teachers now author them; unset values hide the sections instead.

ALTER TABLE public.courses
  ADD COLUMN learning_objectives text[] NOT NULL DEFAULT '{}',
  ADD COLUMN estimated_duration_minutes integer,
  ADD CONSTRAINT courses_estimated_duration_minutes_positive
    CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0);

COMMENT ON COLUMN public.courses.learning_objectives IS
  'Teacher-authored outcomes rendered as "What you''ll learn" on the public course page. Empty array hides the section (never derived from lesson content).';
COMMENT ON COLUMN public.courses.estimated_duration_minutes IS
  'Teacher-set estimate of total course duration in minutes. NULL hides duration on the public page.';
