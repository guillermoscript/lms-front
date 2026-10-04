-- #850 — account deletion (Google Play / App Store requirement).
--
-- Deleting an account is `auth.admin.deleteUser()`: GoTrue deletes the
-- auth.users row and every foreign key decides what happens to the rest.
-- Before this migration that delete could not succeed (≈40 NO ACTION keys to
-- auth.users/profiles refused it) and, where it could, it did the wrong thing
-- (transactions and invoices CASCADEd away the school's accounting; a
-- teacher's exams and exercises CASCADEd away the school's content).
--
-- The rule this migration encodes, one key at a time:
--   * The person's own activity goes with them       → ON DELETE CASCADE
--   * Money records stay, anonymised                 → ON DELETE SET NULL
--   * Content they authored or actions they took for
--     a school stay with the school, unattributed     → ON DELETE SET NULL
--
-- The route (`POST /api/account/delete`) calls `account_deletion_blockers()`
-- first and `prepare_account_deletion()` right before deleteUser.

-- Re-point one foreign key: drop it by name (if present) and add it back
-- with the wanted ON DELETE action. SET NULL also drops NOT NULL.
CREATE OR REPLACE FUNCTION pg_temp.repoint_fk(
  _table regclass, _column text, _conname text, _ref text, _action text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', _table, _conname);
  IF _action = 'SET NULL' THEN
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', _table, _column);
  END IF;
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s ON DELETE %s',
    _table, _conname, _column, _ref, _action
  );
END $$;

-- ── The person's own activity: CASCADE ──────────────────────────────────
SELECT pg_temp.repoint_fk('public.comment_flags', 'user_id', 'comment_flags_user_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.comment_reactions', 'user_id', 'comment_reactions_user_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.community_comments', 'author_id', 'community_comments_author_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.community_flags', 'reporter_id', 'community_flags_reporter_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.community_poll_votes', 'user_id', 'community_poll_votes_user_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.community_posts', 'author_id', 'community_posts_author_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.community_reactions', 'user_id', 'community_reactions_user_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.community_user_mutes', 'user_id', 'community_user_mutes_user_id_fkey', 'public.profiles(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.exam_scores', 'student_id', 'exam_scores_student_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.exam_submissions', 'student_id', 'exam_submissions_student_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.exam_views', 'user_id', 'exam_views_user_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.grades', 'student_id', 'grades_student_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.lesson_passed', 'user_id', 'lesson_passed_user_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.reviews', 'user_id', 'reviews_user_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.submissions', 'student_id', 'submissions_student_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.teacher_preview_sessions', 'teacher_id', 'teacher_preview_sessions_teacher_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.tenant_invitations', 'invited_by', 'tenant_invitations_invited_by_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.ticket_messages', 'user_id', 'ticket_messages_user_id_fkey', 'auth.users(id)', 'CASCADE');
SELECT pg_temp.repoint_fk('public.tickets', 'user_id', 'tickets_user_id_fkey', 'auth.users(id)', 'CASCADE');
-- Subscriptions are the person's access record; the money stays in transactions.
SELECT pg_temp.repoint_fk('public.subscriptions', 'user_id', 'subscriptions_user_profile_fkey', 'public.profiles(id)', 'CASCADE');

-- ── Money records: kept, anonymised ─────────────────────────────────────
SELECT pg_temp.repoint_fk('public.transactions', 'user_id', 'transactions_user_id_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.invoices', 'user_id', 'invoices_user_id_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.payment_requests', 'user_id', 'payment_requests_user_id_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.platform_payment_requests', 'requested_by', 'platform_payment_requests_requested_by_fkey', 'auth.users(id)', 'SET NULL');

-- ── School content and staff actions: kept, unattributed ────────────────
SELECT pg_temp.repoint_fk('public.certificate_templates', 'created_by', 'certificate_templates_created_by_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.certificates', 'revoked_by', 'certificates_revoked_by_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.community_flags', 'reviewed_by', 'community_flags_reviewed_by_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.community_user_mutes', 'muted_by', 'community_user_mutes_muted_by_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.content_versions', 'changed_by', 'content_versions_changed_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.courses', 'author_id', 'courses_author_id_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.courses', 'author_id', 'courses_author_profile_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.exam_question_scores', 'teacher_id', 'exam_question_scores_teacher_id_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.exam_scores', 'teacher_id', 'exam_scores_teacher_id_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.exams', 'created_by', 'exams_created_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.exercises', 'created_by', 'exercises_created_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.lesson_checkpoints', 'created_by', 'lesson_checkpoints_created_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.lesson_resources', 'uploaded_by', 'lesson_resources_uploaded_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.notification_templates', 'created_by', 'notification_templates_created_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.notifications', 'created_by', 'notifications_created_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.notifications', 'created_by', 'notifications_created_by_profile_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.payment_requests', 'processed_by', 'payment_requests_processed_by_fkey', 'public.profiles(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.payouts', 'recorded_by', 'payouts_recorded_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.platform_payment_requests', 'confirmed_by', 'platform_payment_requests_confirmed_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.platform_subscriptions', 'plan_override_by', 'platform_subscriptions_plan_override_by_fkey', 'auth.users(id)', 'SET NULL');
SELECT pg_temp.repoint_fk('public.prompt_templates', 'created_by', 'prompt_templates_created_by_fkey', 'auth.users(id)', 'SET NULL');

-- ── An anonymised transaction must not re-grant access ──────────────────
-- ON DELETE SET NULL is an UPDATE, so after_transaction_update fires for
-- every one of the person's transactions with user_id = NULL. A successful
-- product sale would call enroll_user(NULL, …). Nothing to grant to nobody.
CREATE OR REPLACE FUNCTION public.trigger_manage_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  _course_id INTEGER;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Product purchase → enroll in linked courses
  IF NEW.product_id IS NOT NULL THEN
    SELECT course_id INTO _course_id
    FROM public.product_courses
    WHERE product_id = NEW.product_id;
    IF FOUND AND NEW.status = 'successful'::public.transaction_status THEN
      PERFORM public.enroll_user(NEW.user_id, NEW.product_id);
    END IF;
  END IF;

  -- Plan purchase or renewal
  IF NEW.plan_id IS NOT NULL THEN
    IF NEW.status = 'successful'::public.transaction_status THEN
      PERFORM public.handle_new_subscription(NEW.user_id, NEW.plan_id, NEW.transaction_id);
    ELSIF NEW.status = 'failed'::public.transaction_status THEN
      PERFORM public.cancel_subscription(NEW.user_id, NEW.plan_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Why an account cannot be deleted yet ────────────────────────────────
-- Returns one row per reason; empty = deletable.
--   super_admin        → another operator must remove the grant first
--   sole_admin         → the school would be left with no admin (detail = school name)
--   live_subscription  → a recurring charge would keep running (detail = plan name)
CREATE OR REPLACE FUNCTION public.account_deletion_blockers(_user_id uuid)
RETURNS TABLE (reason text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'super_admin', NULL::text
  FROM public.super_admins WHERE user_id = _user_id
  UNION ALL
  SELECT 'sole_admin', t.name
  FROM public.tenant_users me
  JOIN public.tenants t ON t.id = me.tenant_id
  WHERE me.user_id = _user_id
    AND me.role = 'admin' AND me.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.tenant_users other
      WHERE other.tenant_id = me.tenant_id
        AND other.user_id <> _user_id
        AND other.role = 'admin' AND other.status = 'active'
    )
  UNION ALL
  SELECT 'live_subscription', p.plan_name
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.plan_id = s.plan_id
  WHERE s.user_id = _user_id
    AND s.subscription_status IN ('active', 'renewed', 'past_due')
    AND NOT COALESCE(s.cancel_at_period_end, false);
$$;

-- ── Close what is still open, right before the auth row goes ────────────
-- A pending checkout or manual payment request would otherwise survive
-- anonymised and could still be confirmed into an enrollment for nobody.
-- Returns the person's storage objects so the route can remove the files
-- (storage rows can't be deleted from SQL; the Storage API owns them).
CREATE OR REPLACE FUNCTION public.prepare_account_deletion(_user_id uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.transactions
     SET status = 'canceled'
   WHERE user_id = _user_id AND status = 'pending';

  UPDATE public.payment_requests
     SET status = 'cancelled'
   WHERE user_id = _user_id
     AND status IN ('pending', 'contacted', 'payment_received');

  -- The row stays for the school's books; the contact details it copied
  -- from the person do not.
  UPDATE public.payment_requests
     SET contact_name = '', contact_email = '', contact_phone = NULL,
         message = NULL, payer_name = NULL, payer_phone = NULL
   WHERE user_id = _user_id;

  RETURN QUERY
    SELECT o.bucket_id, o.name
    FROM storage.objects o
    WHERE o.owner = _user_id OR o.owner_id = _user_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.account_deletion_blockers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_blockers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;
