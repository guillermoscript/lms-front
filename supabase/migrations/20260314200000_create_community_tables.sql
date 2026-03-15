-- Migration: Create Community Spaces
-- Description: Community feed, comments, reactions, polls, moderation
-- Tables: community_posts, community_comments, community_reactions,
--         community_poll_options, community_poll_votes, community_user_mutes, community_flags

-- =====================================================
-- 1. TABLES
-- =====================================================

-- community_posts — Core posts table (school-level or course-scoped)
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  course_id INTEGER REFERENCES public.courses(course_id),
  post_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (post_type IN ('standard', 'discussion_prompt', 'milestone', 'poll')),
  title TEXT,
  content TEXT NOT NULL,
  media_urls JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  lesson_id INTEGER REFERENCES public.lessons(id),
  is_graded BOOLEAN NOT NULL DEFAULT false,
  milestone_type TEXT,
  milestone_data JSONB,
  comment_count INTEGER NOT NULL DEFAULT 0,
  reaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_posts_school_feed
  ON public.community_posts (tenant_id, created_at DESC)
  WHERE course_id IS NULL;

CREATE INDEX idx_community_posts_course_feed
  ON public.community_posts (tenant_id, course_id, created_at DESC);

CREATE INDEX idx_community_posts_author
  ON public.community_posts (author_id);

CREATE INDEX idx_community_posts_lesson
  ON public.community_posts (lesson_id)
  WHERE lesson_id IS NOT NULL;

COMMENT ON TABLE public.community_posts IS 'Community feed posts — school-wide (course_id NULL) or course-scoped';

-- community_comments — Threaded comments on posts
CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  parent_comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_comments_post
  ON public.community_comments (post_id, created_at);

CREATE INDEX idx_community_comments_parent
  ON public.community_comments (parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

COMMENT ON TABLE public.community_comments IS 'Threaded comments on community posts';

-- community_reactions — Reactions on posts or comments
CREATE TABLE IF NOT EXISTS public.community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL
    CHECK (reaction_type IN ('like', 'helpful', 'insightful', 'fire')),
  CONSTRAINT reaction_target_check
    CHECK (
      (post_id IS NOT NULL AND comment_id IS NULL)
      OR (post_id IS NULL AND comment_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX idx_community_reactions_post_unique
  ON public.community_reactions (user_id, post_id, reaction_type)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX idx_community_reactions_comment_unique
  ON public.community_reactions (user_id, comment_id, reaction_type)
  WHERE comment_id IS NOT NULL;

COMMENT ON TABLE public.community_reactions IS 'Reactions (like, helpful, insightful, fire) on posts or comments';

-- community_poll_options — Poll answer choices
CREATE TABLE IF NOT EXISTS public.community_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_community_poll_options_post
  ON public.community_poll_options (post_id, sort_order);

COMMENT ON TABLE public.community_poll_options IS 'Answer choices for poll-type community posts';

-- community_poll_votes — One vote per user per poll
CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.community_poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_poll_votes_one_per_user UNIQUE (post_id, user_id)
);

COMMENT ON TABLE public.community_poll_votes IS 'Tracks one vote per user per poll post';

-- community_user_mutes — Moderation mutes
CREATE TABLE IF NOT EXISTS public.community_user_mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  muted_by UUID NOT NULL REFERENCES public.profiles(id),
  reason TEXT,
  muted_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_user_mutes_unique UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE public.community_user_mutes IS 'Muted users per tenant — null muted_until means indefinite';

-- community_flags — Content reports
CREATE TABLE IF NOT EXISTS public.community_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id),
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_flags_tenant_status
  ON public.community_flags (tenant_id, status);

COMMENT ON TABLE public.community_flags IS 'Content reports/flags for moderation';

-- =====================================================
-- 2. TRIGGERS
-- =====================================================

-- updated_at triggers
CREATE TRIGGER set_community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_community_comments_updated_at
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment count trigger function
CREATE OR REPLACE FUNCTION update_community_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_hidden = false THEN
      UPDATE public.community_posts
        SET comment_count = comment_count + 1
        WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_hidden = false THEN
      UPDATE public.community_posts
        SET comment_count = GREATEST(comment_count - 1, 0)
        WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_community_comment_count
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION update_community_post_comment_count();

-- Reaction count trigger function (posts only)
CREATE OR REPLACE FUNCTION update_community_post_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.community_posts
        SET reaction_count = reaction_count + 1
        WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.community_posts
        SET reaction_count = GREATEST(reaction_count - 1, 0)
        WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_community_reaction_count
  AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION update_community_post_reaction_count();

-- =====================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================

-- ─── community_posts ─────────────────────────────────

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.community_posts FROM anon;
REVOKE TRUNCATE ON public.community_posts FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_posts FROM anon;

CREATE POLICY "Users can view visible school-level posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND is_hidden = false
    AND course_id IS NULL
  );

CREATE POLICY "Enrolled users can view visible course posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND is_hidden = false
    AND course_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.course_id = community_posts.course_id
          AND e.user_id = auth.uid()
          AND e.status = 'active'
          AND e.tenant_id = get_tenant_id()
      )
      OR get_tenant_role() IN ('teacher', 'admin')
    )
  );

CREATE POLICY "Admins can view hidden posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND is_hidden = true
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Super admins can view all posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Authenticated users can create posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND tenant_id = get_tenant_id()
  );

CREATE POLICY "Authors and staff can update posts"
  ON public.community_posts FOR UPDATE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND (auth.uid() = author_id OR get_tenant_role() IN ('teacher', 'admin'))
  )
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND (auth.uid() = author_id OR get_tenant_role() IN ('teacher', 'admin'))
  );

CREATE POLICY "Admins can delete posts"
  ON public.community_posts FOR DELETE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

-- ─── community_comments ──────────────────────────────

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.community_comments FROM anon;
REVOKE TRUNCATE ON public.community_comments FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_comments FROM anon;

CREATE POLICY "Users can view visible comments on accessible posts"
  ON public.community_comments FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND is_hidden = false
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.tenant_id = get_tenant_id()
        AND p.is_hidden = false
    )
  );

CREATE POLICY "Admins can view hidden comments"
  ON public.community_comments FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Super admins can view all comments"
  ON public.community_comments FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "Authenticated users can create comments on unlocked posts"
  ON public.community_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND tenant_id = get_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.is_locked = false
        AND p.tenant_id = get_tenant_id()
    )
  );

CREATE POLICY "Authors and staff can update comments"
  ON public.community_comments FOR UPDATE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND (auth.uid() = author_id OR get_tenant_role() IN ('teacher', 'admin'))
  )
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND (auth.uid() = author_id OR get_tenant_role() IN ('teacher', 'admin'))
  );

CREATE POLICY "Admins can delete comments"
  ON public.community_comments FOR DELETE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

-- ─── community_reactions ─────────────────────────────

ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.community_reactions FROM anon;
REVOKE TRUNCATE ON public.community_reactions FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_reactions FROM anon;

CREATE POLICY "Users can view reactions in their tenant"
  ON public.community_reactions FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

CREATE POLICY "Users can create own reactions"
  ON public.community_reactions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND tenant_id = get_tenant_id()
  );

CREATE POLICY "Users can delete own reactions"
  ON public.community_reactions FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND tenant_id = get_tenant_id()
  );

-- ─── community_poll_options ──────────────────────────

ALTER TABLE public.community_poll_options ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.community_poll_options FROM anon;
REVOKE TRUNCATE ON public.community_poll_options FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_poll_options FROM anon;

CREATE POLICY "Users can view poll options for accessible posts"
  ON public.community_poll_options FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_poll_options.post_id
        AND p.tenant_id = get_tenant_id()
        AND p.is_hidden = false
    )
  );

CREATE POLICY "Admins can view all poll options"
  ON public.community_poll_options FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_poll_options.post_id
        AND p.tenant_id = get_tenant_id()
    )
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Teachers and admins can create poll options"
  ON public.community_poll_options FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_poll_options.post_id
        AND p.tenant_id = get_tenant_id()
    )
    AND get_tenant_role() IN ('teacher', 'admin')
  );

-- ─── community_poll_votes ────────────────────────────

ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.community_poll_votes FROM anon;
REVOKE TRUNCATE ON public.community_poll_votes FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_poll_votes FROM anon;

CREATE POLICY "Users can view poll votes in their tenant"
  ON public.community_poll_votes FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id());

CREATE POLICY "Users can cast own vote"
  ON public.community_poll_votes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND tenant_id = get_tenant_id()
  );

-- ─── community_user_mutes ───────────────────────────

ALTER TABLE public.community_user_mutes ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.community_user_mutes FROM anon;
REVOKE TRUNCATE ON public.community_user_mutes FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_user_mutes FROM anon;

CREATE POLICY "Admins can view tenant mutes"
  ON public.community_user_mutes FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Admins can create mutes"
  ON public.community_user_mutes FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Admins can update mutes"
  ON public.community_user_mutes FOR UPDATE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Admins can delete mutes"
  ON public.community_user_mutes FOR DELETE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

-- ─── community_flags ─────────────────────────────────

ALTER TABLE public.community_flags ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE ON public.community_flags FROM anon;
REVOKE TRUNCATE ON public.community_flags FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_flags FROM anon;

CREATE POLICY "Users can view own flags"
  ON public.community_flags FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND reporter_id = auth.uid()
  );

CREATE POLICY "Admins can view all tenant flags"
  ON public.community_flags FOR SELECT TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

CREATE POLICY "Authenticated users can create flags"
  ON public.community_flags FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND tenant_id = get_tenant_id()
  );

CREATE POLICY "Admins can update flags"
  ON public.community_flags FOR UPDATE TO authenticated
  USING (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  )
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND get_tenant_role() = 'admin'
  );

-- =====================================================
-- 4. STORAGE BUCKET
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-assets',
  'community-assets',
  true,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read access for community assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'community-assets');

-- Authenticated users can upload to their tenant folder
CREATE POLICY "Authenticated users can upload community assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-assets');

-- Users can delete their own uploads
CREATE POLICY "Users can delete own community assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
