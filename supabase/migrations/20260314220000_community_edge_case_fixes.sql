-- Edge case security fixes for community tables

-- 1. Prevent comment self-reference cycles
ALTER TABLE public.community_comments
  ADD CONSTRAINT no_self_reply CHECK (id != parent_comment_id);

-- 2. Max nesting depth (5 levels) via trigger
CREATE OR REPLACE FUNCTION check_comment_depth()
RETURNS TRIGGER AS $$
DECLARE
  depth INTEGER := 0;
  current_parent UUID := NEW.parent_comment_id;
BEGIN
  WHILE current_parent IS NOT NULL AND depth < 5 LOOP
    depth := depth + 1;
    SELECT parent_comment_id INTO current_parent
      FROM public.community_comments
      WHERE id = current_parent;
  END LOOP;

  IF depth >= 5 THEN
    RAISE EXCEPTION 'Comment nesting depth exceeds maximum of 5 levels';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_comment_depth
  BEFORE INSERT ON public.community_comments
  FOR EACH ROW
  WHEN (NEW.parent_comment_id IS NOT NULL)
  EXECUTE FUNCTION check_comment_depth();

-- 3. Tighten comment INSERT RLS: require enrollment for course-scoped posts
DROP POLICY IF EXISTS "Users can create comments on unlocked posts" ON public.community_comments;
CREATE POLICY "Users can create comments on unlocked posts"
  ON public.community_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND tenant_id = get_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.is_locked = false
        AND p.tenant_id = get_tenant_id()
        AND (
          p.course_id IS NULL
          OR get_tenant_role() IN ('teacher', 'admin')
          OR EXISTS (
            SELECT 1 FROM public.enrollments e
            WHERE e.course_id = p.course_id
              AND e.user_id = auth.uid()
              AND e.status = 'active'
              AND e.tenant_id = get_tenant_id()
          )
        )
    )
  );
