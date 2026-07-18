-- Fix handle_review_posted_xp (from 20260217030000_tenant_scope_gamification.sql):
-- `reviews` is polymorphic (entity_type, entity_id) — there is no NEW.course_id — so EVERY
-- review insert failed with `record "new" has no field "course_id"`, blocking course reviews
-- (and the testimonials they feed). Resolve the tenant per entity type instead.
CREATE OR REPLACE FUNCTION public.handle_review_posted_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NEW.entity_type = 'courses' THEN
    SELECT c.tenant_id INTO v_tenant_id
    FROM courses c
    WHERE c.course_id = NEW.entity_id;
  ELSIF NEW.entity_type = 'lessons' THEN
    SELECT c.tenant_id INTO v_tenant_id
    FROM lessons l
    JOIN courses c ON c.course_id = l.course_id
    WHERE l.id = NEW.entity_id;
  ELSIF NEW.entity_type = 'exams' THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM exams e
    WHERE e.exam_id = NEW.entity_id;
  END IF;

  PERFORM award_xp(NEW.user_id, 'course_review', 50, NEW.review_id::text, 'review', v_tenant_id);
  RETURN NEW;
END;
$$;
