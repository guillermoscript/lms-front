-- RLS for chats, messages, comment_flags, comment_reactions - Batch 11

-- CHATS
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.chats FROM anon;
REVOKE TRUNCATE ON public.chats FROM authenticated;

CREATE POLICY "Users can manage own chats"
  ON public.chats FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all chats"
  ON public.chats FOR SELECT TO authenticated
  USING (get_tenant_role() = 'admin');

-- MESSAGES
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.messages FROM anon;
REVOKE TRUNCATE ON public.messages FROM authenticated;

CREATE POLICY "Authenticated users can create messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can manage messages"
  ON public.messages FOR ALL TO authenticated
  USING (get_tenant_role() = 'admin')
  WITH CHECK (get_tenant_role() = 'admin');

-- COMMENT_FLAGS
ALTER TABLE public.comment_flags ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.comment_flags FROM anon;
REVOKE TRUNCATE ON public.comment_flags FROM authenticated;

CREATE POLICY "Users can create own comment flags"
  ON public.comment_flags FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own comment flags"
  ON public.comment_flags FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all comment flags"
  ON public.comment_flags FOR SELECT TO authenticated
  USING (get_tenant_role() = 'admin');

CREATE POLICY "Admins can delete comment flags"
  ON public.comment_flags FOR DELETE TO authenticated
  USING (get_tenant_role() = 'admin');

-- COMMENT_REACTIONS
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.comment_reactions FROM anon;
REVOKE TRUNCATE ON public.comment_reactions FROM authenticated;

CREATE POLICY "Authenticated users can view comment reactions"
  ON public.comment_reactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create own comment reactions"
  ON public.comment_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comment reactions"
  ON public.comment_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
