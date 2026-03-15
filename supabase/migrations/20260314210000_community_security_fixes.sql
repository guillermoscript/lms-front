-- Security fixes for community tables

-- 1. Prevent duplicate flags from same reporter on same target
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_flags_unique_report_post
  ON public.community_flags (reporter_id, post_id)
  WHERE post_id IS NOT NULL AND status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_flags_unique_report_comment
  ON public.community_flags (reporter_id, comment_id)
  WHERE comment_id IS NOT NULL AND status = 'pending';

-- 2. Fix storage upload policy to enforce user folder structure
DROP POLICY IF EXISTS "Upload community assets" ON storage.objects;
CREATE POLICY "Upload community assets to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-assets'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 3. Fix storage delete policy to check user ownership
DROP POLICY IF EXISTS "Delete own community assets" ON storage.objects;
CREATE POLICY "Delete own community assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-assets'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 4. Harden trigger functions to verify tenant_id consistency
CREATE OR REPLACE FUNCTION update_community_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_hidden = false THEN
      UPDATE public.community_posts
        SET comment_count = comment_count + 1
        WHERE id = NEW.post_id
          AND tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_hidden = false THEN
      UPDATE public.community_posts
        SET comment_count = GREATEST(comment_count - 1, 0)
        WHERE id = OLD.post_id
          AND tenant_id = OLD.tenant_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_community_post_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.community_posts
        SET reaction_count = reaction_count + 1
        WHERE id = NEW.post_id
          AND tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.community_posts
        SET reaction_count = GREATEST(reaction_count - 1, 0)
        WHERE id = OLD.post_id
          AND tenant_id = OLD.tenant_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Users can view own mute status (for client-side muted banner)
CREATE POLICY "Users can view own mute status"
  ON public.community_user_mutes FOR SELECT TO authenticated
  USING (tenant_id = get_tenant_id() AND user_id = auth.uid());
