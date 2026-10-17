-- Outbound webhooks: more events (entitlements, payments, community, invitations,
-- members, publishing, certificates, payouts, billing, platform billing).
-- Same contract as 20261016140000_outbound_webhooks.sql: AFTER triggers, never
-- fail the source write.

CREATE OR REPLACE FUNCTION public.trg_webhook_entitlement_granted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'entitlement.granted', jsonb_build_object(
      'entitlement_id', NEW.entitlement_id,
      'course_id', NEW.course_id,
      'source_type', NEW.source_type,
      'source_id', NEW.source_id,
      'expires_at', NEW.expires_at,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_entitlement_granted failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_entitlement_granted
  AFTER INSERT ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_entitlement_granted();

CREATE OR REPLACE FUNCTION public.trg_webhook_entitlement_revoked()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'entitlement.revoked', jsonb_build_object(
      'entitlement_id', NEW.entitlement_id,
      'course_id', NEW.course_id,
      'source_type', NEW.source_type,
      'source_id', NEW.source_id,
      'expires_at', NEW.expires_at,
      'revoked_at', NEW.revoked_at,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_entitlement_revoked failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_entitlement_revoked
  AFTER UPDATE OF status ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_entitlement_revoked();

CREATE OR REPLACE FUNCTION public.trg_webhook_payment_failed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'failed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'failed') THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'payment.failed', jsonb_build_object(
      'transaction_id', NEW.transaction_id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'payment_provider', NEW.payment_provider,
      'product_id', NEW.product_id,
      'plan_id', NEW.plan_id,
      'transaction_date', NEW.transaction_date,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_payment_failed failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_payment_failed
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_payment_failed();

CREATE OR REPLACE FUNCTION public.trg_webhook_payment_refunded()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.refunded_amount IS DISTINCT FROM NEW.refunded_amount
     OR (NEW.status = 'refunded' AND OLD.status IS DISTINCT FROM 'refunded') THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'payment.refunded', jsonb_build_object(
      'transaction_id', NEW.transaction_id,
      'amount', COALESCE(NULLIF(COALESCE(NEW.refunded_amount, 0) - COALESCE(OLD.refunded_amount, 0), 0), NEW.refunded_amount, NEW.amount),
      'refunded_amount', NEW.refunded_amount,
      'previous_refunded_amount', OLD.refunded_amount,
      'full_refund', (NEW.status = 'refunded'),
      'currency', NEW.currency,
      'payment_provider', NEW.payment_provider,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_payment_refunded failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_payment_refunded
  AFTER UPDATE OF status, refunded_amount ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_payment_refunded();

CREATE OR REPLACE FUNCTION public.trg_webhook_payment_request_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'payment_request.created', jsonb_build_object(
      'request_id', NEW.request_id,
      'status', NEW.status,
      'product_id', NEW.product_id,
      'plan_id', NEW.plan_id,
      'payment_amount', NEW.payment_amount,
      'payment_currency', NEW.payment_currency,
      'contact_name', NEW.contact_name,
      'contact_email', NEW.contact_email,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_payment_request_created failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_payment_request_created
  AFTER INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_payment_request_created();

CREATE OR REPLACE FUNCTION public.trg_webhook_payment_request_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'payment_request.status_changed', jsonb_build_object(
      'request_id', NEW.request_id,
      'previous_status', OLD.status,
      'status', NEW.status,
      'product_id', NEW.product_id,
      'plan_id', NEW.plan_id,
      'payment_amount', NEW.payment_amount,
      'payment_currency', NEW.payment_currency,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_payment_request_status failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_payment_request_status
  AFTER UPDATE OF status ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_payment_request_status();

CREATE OR REPLACE FUNCTION public.trg_webhook_course_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DECLARE _l RECORD;
  BEGIN
    SELECT l.tenant_id, l.course_id INTO _l FROM public.lessons l WHERE l.id = NEW.lesson_id;
    IF _l.tenant_id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.lessons l WHERE l.course_id = _l.course_id AND l.status = 'published')
       AND NOT EXISTS (
         SELECT 1 FROM public.lessons l
         WHERE l.course_id = _l.course_id AND l.status = 'published'
           AND NOT EXISTS (
             SELECT 1 FROM public.lesson_completions lc
             WHERE lc.lesson_id = l.id AND lc.user_id = NEW.user_id
           )
       ) THEN
      PERFORM public.emit_outbound_webhook(_l.tenant_id, 'course.completed', jsonb_build_object(
        'course_id', _l.course_id,
        'completed_at', NEW.completed_at,
        'user', public.webhook_user_json(NEW.user_id)
      ));
    END IF;
  END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_course_completed failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_course_completed
  AFTER INSERT ON public.lesson_completions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_course_completed();

CREATE OR REPLACE FUNCTION public.trg_webhook_exam_outcome()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DECLARE _mark NUMERIC; _passed BOOLEAN;
  BEGIN
    IF NEW.score IS NULL THEN RETURN NEW; END IF;
    SELECT COALESCE((SELECT ct.min_exam_pass_score FROM public.certificate_templates ct
                     WHERE ct.course_id = (SELECT e.course_id FROM public.exams e WHERE e.exam_id = NEW.exam_id)
                       AND ct.is_active LIMIT 1), 70) INTO _mark;
    _passed := NEW.score >= _mark;
    IF TG_OP = 'UPDATE' AND OLD.score IS NOT NULL AND (OLD.score >= _mark) = _passed THEN
      RETURN NEW;
    END IF;
    PERFORM public.emit_outbound_webhook(NEW.tenant_id,
      CASE WHEN _passed THEN 'exam.passed' ELSE 'exam.failed' END,
      jsonb_build_object(
        'submission_id', NEW.submission_id,
        'exam_id', NEW.exam_id,
        'score', NEW.score,
        'pass_mark', _mark,
        'user', public.webhook_user_json(NEW.student_id)
      ));
  END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_exam_outcome failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_exam_outcome
  AFTER INSERT OR UPDATE OF score ON public.exam_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_exam_outcome();

CREATE OR REPLACE FUNCTION public.trg_webhook_community_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.is_hidden AND NEW.post_type <> 'milestone' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'community.post.created', jsonb_build_object(
      'post_id', NEW.id,
      'post_type', NEW.post_type,
      'course_id', NEW.course_id,
      'title', NEW.title,
      'author', public.webhook_user_json(NEW.author_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_community_post failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_community_post
  AFTER INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_community_post();

CREATE OR REPLACE FUNCTION public.trg_webhook_community_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.is_hidden THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'community.comment.created', jsonb_build_object(
      'comment_id', NEW.id,
      'post_id', NEW.post_id,
      'parent_comment_id', NEW.parent_comment_id,
      'is_reply', (NEW.parent_comment_id IS NOT NULL),
      'author', public.webhook_user_json(NEW.author_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_community_comment failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_community_comment
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_community_comment();

CREATE OR REPLACE FUNCTION public.trg_webhook_community_report()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'community.content_reported', jsonb_build_object(
      'flag_id', NEW.id,
      'target_type', CASE WHEN NEW.comment_id IS NOT NULL THEN 'comment' ELSE 'post' END,
      'post_id', NEW.post_id,
      'comment_id', NEW.comment_id,
      'reason', NEW.reason,
      'reporter', public.webhook_user_json(NEW.reporter_id)
    ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_community_report failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_community_report
  AFTER INSERT ON public.community_flags
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_community_report();

CREATE OR REPLACE FUNCTION public.trg_webhook_invitation_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'invitation.created', jsonb_build_object(
      'invitation_id', NEW.id,
      'email', NEW.email,
      'role', NEW.role,
      'invited_by', CASE WHEN NEW.invited_by IS NULL THEN NULL ELSE public.webhook_user_json(NEW.invited_by) END
    ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_invitation_created failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_invitation_created
  AFTER INSERT ON public.tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_invitation_created();

CREATE OR REPLACE FUNCTION public.trg_webhook_invitation_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'invitation.accepted', jsonb_build_object(
      'invitation_id', NEW.id,
      'email', NEW.email,
      'role', NEW.role,
      'invited_by', CASE WHEN NEW.invited_by IS NULL THEN NULL ELSE public.webhook_user_json(NEW.invited_by) END,
      'accepted_at', NEW.accepted_at
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_invitation_accepted failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_invitation_accepted
  AFTER UPDATE OF status ON public.tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_invitation_accepted();

CREATE OR REPLACE FUNCTION public.trg_webhook_member_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'member.status_changed', jsonb_build_object(
      'previous_status', OLD.status,
      'status', NEW.status,
      'ban_reason', CASE WHEN NEW.status = 'banned' THEN NEW.ban_reason ELSE NULL END,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_member_status failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_member_status
  AFTER UPDATE OF status ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_member_status();

CREATE OR REPLACE FUNCTION public.trg_webhook_member_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'member.role_changed', jsonb_build_object(
      'previous_role', OLD.role,
      'role', NEW.role,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_member_role failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_member_role
  AFTER UPDATE OF role ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_member_role();

CREATE OR REPLACE FUNCTION public.trg_webhook_course_published()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'course.published', jsonb_build_object(
      'course_id', NEW.course_id,
      'title', NEW.title
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_course_published failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_course_published
  AFTER UPDATE OF status ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_course_published();

CREATE OR REPLACE FUNCTION public.trg_webhook_lesson_published()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'lesson.published', jsonb_build_object(
      'lesson_id', NEW.id,
      'course_id', NEW.course_id,
      'title', NEW.title
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_lesson_published failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_lesson_published
  AFTER UPDATE OF status ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_lesson_published();

CREATE OR REPLACE FUNCTION public.trg_webhook_certificate_revoked()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'certificate.revoked', jsonb_build_object(
      'certificate_id', NEW.certificate_id,
      'course_id', NEW.course_id,
      'verification_code', NEW.verification_code,
      'revoke_reason', NEW.revoke_reason,
      'revoked_at', NEW.revoked_at,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_certificate_revoked failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_certificate_revoked
  AFTER UPDATE OF revoked_at ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_certificate_revoked();

CREATE OR REPLACE FUNCTION public.trg_webhook_payout_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'payout.created', jsonb_build_object(
      'payout_id', NEW.payout_id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'status', NEW.status,
      'payout_method', NEW.payout_method,
      'period_start', NEW.period_start,
      'period_end', NEW.period_end,
      'failure_reason', NEW.failure_reason,
      'paid_at', NEW.paid_at
    ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_payout_created failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_payout_created
  AFTER INSERT ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_payout_created();

CREATE OR REPLACE FUNCTION public.trg_webhook_payout_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'payout.status_changed', jsonb_build_object(
      'payout_id', NEW.payout_id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'status', NEW.status,
      'payout_method', NEW.payout_method,
      'period_start', NEW.period_start,
      'period_end', NEW.period_end,
      'failure_reason', NEW.failure_reason,
      'paid_at', NEW.paid_at,
      'previous_status', OLD.status
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_payout_status failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_payout_status
  AFTER UPDATE OF status ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_payout_status();

CREATE OR REPLACE FUNCTION public.trg_webhook_billing_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.billing_status IS DISTINCT FROM NEW.billing_status THEN
    PERFORM public.emit_outbound_webhook(NEW.id, 'billing.status_changed', jsonb_build_object(
      'previous_status', OLD.billing_status,
      'status', NEW.billing_status
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_billing_status failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_billing_status
  AFTER UPDATE OF billing_status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_billing_status();

CREATE OR REPLACE FUNCTION public.trg_webhook_access_cutoff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'school.access_cutoff', jsonb_build_object(
      'stage', NEW.stage,
      'cutoff_at', NEW.cutoff_at
    ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_access_cutoff failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_access_cutoff
  AFTER INSERT ON public.access_cutoff_notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_access_cutoff();

CREATE OR REPLACE FUNCTION public.trg_webhook_platform_payment_requested()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'platform_payment.requested', jsonb_build_object(
      'request_id', NEW.request_id,
      'request_type', NEW.request_type,
      'status', NEW.status,
      'plan_id', NEW.plan_id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'payment_provider', NEW.payment_provider
    ), TRUE);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_platform_payment_requested failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_platform_payment_requested
  AFTER INSERT ON public.platform_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_platform_payment_requested();

CREATE OR REPLACE FUNCTION public.trg_webhook_platform_payment_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'platform_payment.status_changed', jsonb_build_object(
      'request_id', NEW.request_id,
      'request_type', NEW.request_type,
      'status', NEW.status,
      'plan_id', NEW.plan_id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'payment_provider', NEW.payment_provider,
      'previous_status', OLD.status
    ), TRUE);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_platform_payment_status failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_platform_payment_status
  AFTER UPDATE OF status ON public.platform_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_platform_payment_status();

CREATE OR REPLACE FUNCTION public.trg_webhook_platform_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.plan_id IS DISTINCT FROM NEW.plan_id
     OR OLD."interval" IS DISTINCT FROM NEW."interval"
     OR OLD.cancel_at_period_end IS DISTINCT FROM NEW.cancel_at_period_end THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'platform_subscription.changed', jsonb_build_object(
      'subscription_id', NEW.subscription_id,
      'plan_id', NEW.plan_id,
      'previous_plan_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_id END,
      'interval', NEW."interval",
      'status', NEW.status,
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
      'cancel_at_period_end', NEW.cancel_at_period_end,
      'current_period_end', NEW.current_period_end
    ), TRUE);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_platform_subscription failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_platform_subscription
  AFTER INSERT OR UPDATE OF status, plan_id, "interval", cancel_at_period_end ON public.platform_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_platform_subscription();
