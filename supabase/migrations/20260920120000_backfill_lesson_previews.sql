-- Backfill free-preview lessons for existing courses (issue #797).
--
-- 20260722120000_lesson_preview.sql added lessons.is_preview so logged-out
-- visitors can read one free lesson per course, and #791 made a NEWLY
-- CREATED course default its first lesson to is_preview = true. Neither
-- touched the courses that already existed: production has 83 lessons and
-- exactly 1 marked as a preview, so the free-lesson funnel that public course
-- pages are built around has almost nothing to show.
--
-- This marks the first lesson of every published course as a free preview,
-- where "first" is the lowest `sequence` among that course's PUBLISHED
-- lessons — not `sequence = 1`, which a renumbered or deleted lesson 1 would
-- make wrong or absent. A course that already has a preview lesson is left
-- alone entirely: a teacher who chose to make lesson 4 the free one made a
-- decision, and a backfill has no business overruling it. Re-running this is
-- a no-op — once a course has any preview lesson, NOT EXISTS excludes it.

WITH first_published_lesson AS (
  SELECT DISTINCT ON (l.course_id)
    l.id AS lesson_id
  FROM public.lessons l
  JOIN public.courses c ON c.course_id = l.course_id
  WHERE l.status = 'published'
    AND c.status = 'published'
    AND NOT EXISTS (
      SELECT 1
      FROM public.lessons preview
      WHERE preview.course_id = l.course_id
        AND preview.is_preview = true
    )
  ORDER BY l.course_id, l.sequence ASC NULLS LAST, l.id ASC
)
UPDATE public.lessons
SET is_preview = true
WHERE id IN (SELECT lesson_id FROM first_published_lesson);
