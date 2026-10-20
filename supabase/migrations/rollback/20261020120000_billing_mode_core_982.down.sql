-- Rollback for 20261020120000_billing_mode_core_982.sql — PARTIAL, by design.
-- Restores the dropped columns, the exemption function and the short function
-- bodies. It deliberately KEEPS tenants.billing_mode, effective_school_percentage()
-- and the billing_mode-aware ledger / revenue / snapshot / promote / confirm /
-- downgrade functions (their previous bodies live in the source migrations named in
-- the up file): everything continues to work with every tenant on `paid`.
-- Data in plan_override_* / enforcement_exempt is NOT restored (comped rows stay).

ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS plan_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_override_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_plan_override
  ON public.platform_subscriptions (plan_override_at)
  WHERE plan_override_at IS NOT NULL;

ALTER TABLE public.tenant_fee_standing
  ADD COLUMN IF NOT EXISTS enforcement_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exempt_reason text,
  ADD COLUMN IF NOT EXISTS exempt_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exempt_set_at timestamptz;
ALTER TABLE public.tenant_fee_standing
  ADD CONSTRAINT tenant_fee_standing_exempt_not_blocked
  CHECK (NOT (enforcement_exempt AND blocked_at IS NOT NULL)) NOT VALID;

CREATE OR REPLACE FUNCTION public.is_tenant_sales_blocked(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT c.enforcement_mode = 'enforce' FROM platform_fee_config c WHERE c.id),
    false
  )
  AND EXISTS (
    SELECT 1 FROM tenant_fee_standing s
    WHERE s.tenant_id = _tenant_id AND s.blocked_at IS NOT NULL AND NOT s.enforcement_exempt
  );
$function$;

CREATE OR REPLACE FUNCTION public.tenant_plan_limit(_tenant_id uuid, _key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
           WHEN jsonb_typeof(pp.limits -> _key) = 'number'
             THEN (pp.limits ->> _key)::numeric::integer
           ELSE -1
         END
  FROM public.tenants t
  LEFT JOIN public.platform_plans pp ON pp.slug = COALESCE(t.plan, 'free')
  WHERE t.id = _tenant_id;
$$;

CREATE OR REPLACE FUNCTION public.has_course_access(_user_id uuid, _course_id integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    JOIN tenants t ON t.id = e.tenant_id
    WHERE e.user_id = _user_id
      AND e.course_id = _course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
      AND (t.access_cutoff_at IS NULL OR t.access_cutoff_at > now())
  );
$function$;

-- get_plan_features: restore the free-row fallback.
CREATE OR REPLACE FUNCTION public.get_plan_features(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan_slug varchar;
  _result jsonb;
BEGIN
  SELECT plan INTO _plan_slug FROM public.tenants WHERE id = _tenant_id;
  _plan_slug := COALESCE(_plan_slug, 'free');
  SELECT jsonb_build_object('plan', pp.slug, 'plan_name', pp.name, 'features', pp.features,
    'limits', pp.limits, 'transaction_fee_percent', pp.transaction_fee_percent)
  INTO _result FROM public.platform_plans pp WHERE pp.slug = _plan_slug;
  IF _result IS NULL THEN
    SELECT jsonb_build_object('plan', pp.slug, 'plan_name', pp.name, 'features', pp.features,
      'limits', pp.limits, 'transaction_fee_percent', pp.transaction_fee_percent)
    INTO _result FROM public.platform_plans pp WHERE pp.slug = 'free';
  END IF;
  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_fee_exemption(
  _tenant_id uuid, _exempt boolean, _actor uuid, _reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
BEGIN
  PERFORM assert_platform_fee_super_admin(_actor);
  IF _exempt IS NULL THEN
    RAISE EXCEPTION 'exempt must be true or false' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = _tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO tenant_fee_standing (tenant_id, state, enforcement_exempt, exempt_reason, exempt_set_by, exempt_set_at, updated_at)
  VALUES (_tenant_id, 'ok', _exempt, btrim(_reason), _actor, _now, _now)
  ON CONFLICT (tenant_id) DO UPDATE SET
    enforcement_exempt = EXCLUDED.enforcement_exempt,
    exempt_reason = EXCLUDED.exempt_reason,
    exempt_set_by = EXCLUDED.exempt_set_by,
    exempt_set_at = EXCLUDED.exempt_set_at,
    state = CASE WHEN EXCLUDED.enforcement_exempt AND tenant_fee_standing.state = 'blocked'
                 THEN 'overdue' ELSE tenant_fee_standing.state END,
    blocked_at = CASE WHEN EXCLUDED.enforcement_exempt THEN NULL ELSE tenant_fee_standing.blocked_at END,
    updated_at = EXCLUDED.updated_at;
  INSERT INTO platform_fee_audit_log (tenant_id, actor_id, action, reason)
  VALUES (_tenant_id, _actor, CASE WHEN _exempt THEN 'exemption_set' ELSE 'exemption_cleared' END, btrim(_reason));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_fee_exemption(uuid, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_fee_exemption(uuid, boolean, uuid, text) TO service_role;
