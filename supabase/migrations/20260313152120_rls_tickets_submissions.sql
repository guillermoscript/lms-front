-- RLS for tickets, ticket_messages, submissions - Batch 10

-- TICKETS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.tickets FROM anon;
REVOKE TRUNCATE ON public.tickets FROM authenticated;

CREATE POLICY "Users can view own tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tickets"
  ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (get_tenant_role() = 'admin');

CREATE POLICY "Admins can update all tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (get_tenant_role() = 'admin');

-- TICKET_MESSAGES
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.ticket_messages FROM anon;
REVOKE TRUNCATE ON public.ticket_messages FROM authenticated;

CREATE POLICY "Users can view messages on own tickets"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM tickets t WHERE t.ticket_id = ticket_messages.ticket_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can create messages on own tickets"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all ticket messages"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (get_tenant_role() = 'admin');

CREATE POLICY "Admins can create ticket messages"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (get_tenant_role() = 'admin');

-- SUBMISSIONS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, DELETE, INSERT, UPDATE ON public.submissions FROM anon;
REVOKE TRUNCATE ON public.submissions FROM authenticated;

CREATE POLICY "Students can view own submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Students can create own submissions"
  ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Teachers and admins can view all submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));

CREATE POLICY "Teachers and admins can update submissions"
  ON public.submissions FOR UPDATE TO authenticated
  USING (get_tenant_role() IN ('teacher', 'admin'));
