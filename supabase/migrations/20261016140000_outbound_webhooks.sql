-- Outbound webhooks: schools (and the platform) subscribe URLs (n8n, Zapier,
-- Make, custom code) to LMS events.
--
-- Design:
--   * endpoints: tenant_id = a school's own endpoint; tenant_id IS NULL = a
--     platform-wide endpoint (receives every school's events + platform-only
--     events). Holds the signing secret, so it is service-role only.
--   * deliveries: a durable outbox. Events are captured by AFTER triggers on the
--     source tables, so every write path (client RLS inserts, RPCs, server
--     actions, provider webhooks) emits without app code having to remember to.
--     A worker (cron + "send test") claims due rows, POSTs them signed, and
--     retries with backoff.
--   * emitting NEVER breaks the source write: every emitter swallows its own
--     errors into a WARNING.

CREATE TABLE public.outbound_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url TEXT NOT NULL CHECK (char_length(url) BETWEEN 8 AND 2048),
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_reason TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.outbound_webhook_endpoints IS
  'Outbound webhook subscriptions. tenant_id NULL = platform-wide. Holds the HMAC signing secret: service role only.';

CREATE INDEX idx_outbound_webhook_endpoints_tenant
  ON public.outbound_webhook_endpoints (tenant_id) WHERE is_active;

CREATE TABLE public.outbound_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES public.outbound_webhook_endpoints(id) ON DELETE CASCADE,
  -- Tenant the EVENT belongs to (NULL for platform-only events). Not the endpoint's scope.
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status_code INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

COMMENT ON TABLE public.outbound_webhook_deliveries IS
  'Outbox of outbound webhook deliveries: one row per (event, endpoint). pending -> success | failed (retries exhausted).';

CREATE INDEX idx_outbound_webhook_deliveries_due
  ON public.outbound_webhook_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_outbound_webhook_deliveries_endpoint_created
  ON public.outbound_webhook_deliveries (endpoint_id, created_at DESC);
CREATE INDEX idx_outbound_webhook_deliveries_created
  ON public.outbound_webhook_deliveries (created_at);

ALTER TABLE public.outbound_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_webhook_endpoints FROM anon, authenticated;
REVOKE ALL ON public.outbound_webhook_deliveries FROM anon, authenticated;
GRANT ALL ON public.outbound_webhook_endpoints TO service_role;
GRANT ALL ON public.outbound_webhook_deliveries TO service_role;

-- Bound trigger fan-out: at most 10 endpoints per school, 20 platform-wide.
CREATE OR REPLACE FUNCTION public.enforce_outbound_webhook_endpoint_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE _count INTEGER; _cap INTEGER;
BEGIN
  SELECT COUNT(*) INTO _count FROM public.outbound_webhook_endpoints e
  WHERE e.tenant_id IS NOT DISTINCT FROM NEW.tenant_id;
  _cap := CASE WHEN NEW.tenant_id IS NULL THEN 20 ELSE 10 END;
  IF _count >= _cap THEN
    RAISE EXCEPTION 'webhook endpoint limit reached' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_outbound_webhook_endpoint_cap
  BEFORE INSERT ON public.outbound_webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.enforce_outbound_webhook_endpoint_cap();

-- Worker lease: hand out due deliveries and push their next_attempt_at out so a
-- concurrent worker (or a crashed one) cannot double-send inside the lease.
CREATE OR REPLACE FUNCTION public.claim_outbound_webhook_deliveries(_limit INTEGER)
RETURNS SETOF public.outbound_webhook_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT d.id FROM public.outbound_webhook_deliveries d
    WHERE d.status = 'pending' AND d.next_attempt_at <= now()
    ORDER BY d.next_attempt_at
    LIMIT GREATEST(1, LEAST(_limit, 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbound_webhook_deliveries d
  SET next_attempt_at = now() + INTERVAL '5 minutes'
  FROM due WHERE d.id = due.id
  RETURNING d.*;
$$;

-- Event emitter. _platform_only events go to platform-wide endpoints only.
CREATE OR REPLACE FUNCTION public.emit_outbound_webhook(
  _tenant_id UUID, _event_type TEXT, _data JSONB, _platform_only BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id UUID := gen_random_uuid();
  _payload JSONB;
BEGIN
  _payload := jsonb_build_object(
    'id', _event_id,
    'type', _event_type,
    'created_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'tenant_id', _tenant_id,
    'data', _data
  );

  INSERT INTO public.outbound_webhook_deliveries (endpoint_id, tenant_id, event_id, event_type, payload)
  SELECT e.id, _tenant_id, _event_id, _event_type, _payload
  FROM public.outbound_webhook_endpoints e
  WHERE e.is_active
    AND (e.events @> ARRAY['*']::TEXT[] OR e.events @> ARRAY[_event_type])
    AND (e.tenant_id IS NULL OR (NOT _platform_only AND e.tenant_id = _tenant_id));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_outbound_webhook(%) failed: %', _event_type, SQLERRM;
END $$;

-- {id, full_name, email} for a user, for payloads automations can act on.
CREATE OR REPLACE FUNCTION public.webhook_user_json(_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('id', u.id, 'full_name', p.full_name, 'email', u.email)
     FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
     WHERE u.id = _user_id),
    jsonb_build_object('id', _user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.emit_outbound_webhook(UUID, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webhook_user_json(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_outbound_webhook_deliveries(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_outbound_webhook(UUID, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.webhook_user_json(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_outbound_webhook_deliveries(INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Source triggers. Each is a thin wrapper: build `data`, call the emitter.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_webhook_enrollment_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'enrollment.created', jsonb_build_object(
    'enrollment_id', NEW.enrollment_id,
    'course_id', NEW.course_id,
    'status', NEW.status,
    'user', public.webhook_user_json(NEW.user_id)
  ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_enrollment_created failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_enrollment_created
  AFTER INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_enrollment_created();

CREATE OR REPLACE FUNCTION public.trg_webhook_lesson_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l RECORD;
BEGIN
  SELECT l.tenant_id, l.course_id, l.title INTO _l FROM public.lessons l WHERE l.id = NEW.lesson_id;
  IF _l.tenant_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.emit_outbound_webhook(_l.tenant_id, 'lesson.completed', jsonb_build_object(
    'lesson_id', NEW.lesson_id,
    'lesson_title', _l.title,
    'course_id', _l.course_id,
    'completed_at', NEW.completed_at,
    'user', public.webhook_user_json(NEW.user_id)
  ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_lesson_completed failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_lesson_completed
  AFTER INSERT ON public.lesson_completions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_lesson_completed();

CREATE OR REPLACE FUNCTION public.trg_webhook_exam_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'exam.submitted', jsonb_build_object(
      'submission_id', NEW.submission_id,
      'exam_id', NEW.exam_id,
      'score', NEW.score,
      'submitted_at', NEW.submission_date,
      'user', public.webhook_user_json(NEW.student_id)
    ));
  ELSIF NEW.score IS NOT NULL AND OLD.score IS DISTINCT FROM NEW.score THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'exam.graded', jsonb_build_object(
      'submission_id', NEW.submission_id,
      'exam_id', NEW.exam_id,
      'score', NEW.score,
      'review_status', NEW.review_status,
      'user', public.webhook_user_json(NEW.student_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_exam_submission failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_exam_submission
  AFTER INSERT OR UPDATE OF score ON public.exam_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_exam_submission();

CREATE OR REPLACE FUNCTION public.trg_webhook_payment_succeeded()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'successful' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'successful') THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'payment.succeeded', jsonb_build_object(
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
  RAISE WARNING 'trg_webhook_payment_succeeded failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_payment_succeeded
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_payment_succeeded();

CREATE OR REPLACE FUNCTION public.trg_webhook_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'subscription.created', jsonb_build_object(
      'subscription_id', NEW.subscription_id,
      'plan_id', NEW.plan_id,
      'status', NEW.subscription_status,
      'current_period_end', NEW.current_period_end,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  ELSIF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status THEN
    PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'subscription.status_changed', jsonb_build_object(
      'subscription_id', NEW.subscription_id,
      'plan_id', NEW.plan_id,
      'previous_status', OLD.subscription_status,
      'status', NEW.subscription_status,
      'user', public.webhook_user_json(NEW.user_id)
    ));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_subscription failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_subscription
  AFTER INSERT OR UPDATE OF subscription_status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_subscription();

CREATE OR REPLACE FUNCTION public.trg_webhook_member_joined()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'member.joined', jsonb_build_object(
    'role', NEW.role,
    'joined_at', NEW.joined_at,
    'user', public.webhook_user_json(NEW.user_id)
  ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_member_joined failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_member_joined
  AFTER INSERT ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_member_joined();

CREATE OR REPLACE FUNCTION public.trg_webhook_certificate_issued()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_outbound_webhook(NEW.tenant_id, 'certificate.issued', jsonb_build_object(
    'certificate_id', NEW.certificate_id,
    'course_id', NEW.course_id,
    'verification_code', NEW.verification_code,
    'issued_at', NEW.issued_at,
    'user', public.webhook_user_json(NEW.user_id)
  ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_certificate_issued failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_certificate_issued
  AFTER INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_certificate_issued();

-- Platform-only: school lifecycle, delivered to platform-wide endpoints.
CREATE OR REPLACE FUNCTION public.trg_webhook_school()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_outbound_webhook(NEW.id, 'school.created', jsonb_build_object(
      'school_id', NEW.id, 'name', NEW.name, 'slug', NEW.slug, 'plan', NEW.plan
    ), TRUE);
  ELSE
    IF OLD.plan IS DISTINCT FROM NEW.plan THEN
      PERFORM public.emit_outbound_webhook(NEW.id, 'school.plan_changed', jsonb_build_object(
        'school_id', NEW.id, 'name', NEW.name, 'slug', NEW.slug,
        'previous_plan', OLD.plan, 'plan', NEW.plan
      ), TRUE);
    END IF;
    IF OLD.billing_status IS DISTINCT FROM NEW.billing_status THEN
      PERFORM public.emit_outbound_webhook(NEW.id, 'school.billing_status_changed', jsonb_build_object(
        'school_id', NEW.id, 'name', NEW.name, 'slug', NEW.slug,
        'previous_status', OLD.billing_status, 'status', NEW.billing_status
      ), TRUE);
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_webhook_school failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_school
  AFTER INSERT OR UPDATE OF plan, billing_status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_school();
