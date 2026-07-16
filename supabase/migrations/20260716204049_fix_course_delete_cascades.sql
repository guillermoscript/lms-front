-- Course deletion was blocked by NO ACTION foreign keys. Re-point them so
-- deleting a course cascades through its content and unlinks references
-- that should survive (community posts).

-- Course children / join tables → cascade with the course
ALTER TABLE public.exams
  DROP CONSTRAINT exams_course_id_fkey,
  ADD CONSTRAINT exams_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

ALTER TABLE public.assignments
  DROP CONSTRAINT assignments_course_id_fkey,
  ADD CONSTRAINT assignments_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

ALTER TABLE public.grades
  DROP CONSTRAINT grades_course_id_fkey,
  ADD CONSTRAINT grades_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

ALTER TABLE public.product_courses
  DROP CONSTRAINT product_courses_course_id_fkey,
  ADD CONSTRAINT product_courses_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

ALTER TABLE public.plan_courses
  DROP CONSTRAINT plan_courses_course_id_fkey,
  ADD CONSTRAINT plan_courses_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE CASCADE;

-- Community posts outlive the course; just unlink them (course_id is nullable)
ALTER TABLE public.community_posts
  DROP CONSTRAINT community_posts_course_id_fkey,
  ADD CONSTRAINT community_posts_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(course_id) ON DELETE SET NULL;

-- Second-level blockers: children of exams/assignments must cascade too
ALTER TABLE public.exam_views
  DROP CONSTRAINT exam_views_exam_id_fkey,
  ADD CONSTRAINT exam_views_exam_id_fkey
    FOREIGN KEY (exam_id) REFERENCES public.exams(exam_id) ON DELETE CASCADE;

ALTER TABLE public.submissions
  DROP CONSTRAINT submissions_assignment_id_fkey,
  ADD CONSTRAINT submissions_assignment_id_fkey
    FOREIGN KEY (assignment_id) REFERENCES public.assignments(assignment_id) ON DELETE CASCADE;
