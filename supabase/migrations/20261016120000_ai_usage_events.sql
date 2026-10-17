-- AI usage / cost visibility for BYOK schools.
-- One row per language-model call (a multi-step tutor turn writes one row per
-- step). Tokens only: dollars are estimated at read time from lib/ai/pricing.ts
-- so a price-table fix applies retroactively. Written by server code through
-- the service role; read through the two aggregate functions below, which only
-- service_role can execute (the admin page checks the role first).

CREATE TABLE public.ai_usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_usage_events IS
  'One row per language-model call on a school''s own BYOK key. Tokens only; cost is estimated at read time. Service role only.';

CREATE INDEX idx_ai_usage_events_tenant_created ON public.ai_usage_events (tenant_id, created_at DESC);
CREATE INDEX idx_ai_usage_events_tenant_user_created ON public.ai_usage_events (tenant_id, user_id, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_events FROM anon, authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

-- Totals per (feature, provider, model). Cost is computed by the caller.
CREATE OR REPLACE FUNCTION public.get_ai_usage_by_feature(_tenant_id UUID, _from TIMESTAMPTZ, _to TIMESTAMPTZ)
RETURNS TABLE (
  feature TEXT, provider TEXT, model TEXT,
  calls BIGINT, input_tokens BIGINT, output_tokens BIGINT, cached_input_tokens BIGINT, reasoning_tokens BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.feature, e.provider, e.model,
         COUNT(*), SUM(e.input_tokens)::BIGINT, SUM(e.output_tokens)::BIGINT,
         SUM(e.cached_input_tokens)::BIGINT, SUM(e.reasoning_tokens)::BIGINT
  FROM public.ai_usage_events e
  WHERE e.tenant_id = _tenant_id AND e.created_at >= _from AND e.created_at < _to
  GROUP BY e.feature, e.provider, e.model;
$$;

-- Totals per (user, provider, model) for the per-student view.
CREATE OR REPLACE FUNCTION public.get_ai_usage_by_user(_tenant_id UUID, _from TIMESTAMPTZ, _to TIMESTAMPTZ)
RETURNS TABLE (
  user_id UUID, full_name TEXT, provider TEXT, model TEXT,
  calls BIGINT, input_tokens BIGINT, output_tokens BIGINT, cached_input_tokens BIGINT, reasoning_tokens BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.user_id, p.full_name, e.provider, e.model,
         COUNT(*), SUM(e.input_tokens)::BIGINT, SUM(e.output_tokens)::BIGINT,
         SUM(e.cached_input_tokens)::BIGINT, SUM(e.reasoning_tokens)::BIGINT
  FROM public.ai_usage_events e
  LEFT JOIN public.profiles p ON p.id = e.user_id
  WHERE e.tenant_id = _tenant_id AND e.created_at >= _from AND e.created_at < _to
  GROUP BY e.user_id, p.full_name, e.provider, e.model;
$$;

-- Daily token totals per (day, provider, model) for the trend chart.
CREATE OR REPLACE FUNCTION public.get_ai_usage_daily(_tenant_id UUID, _from TIMESTAMPTZ, _to TIMESTAMPTZ)
RETURNS TABLE (
  day DATE, provider TEXT, model TEXT,
  calls BIGINT, input_tokens BIGINT, output_tokens BIGINT, cached_input_tokens BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (e.created_at AT TIME ZONE 'utc')::date, e.provider, e.model,
         COUNT(*), SUM(e.input_tokens)::BIGINT, SUM(e.output_tokens)::BIGINT, SUM(e.cached_input_tokens)::BIGINT
  FROM public.ai_usage_events e
  WHERE e.tenant_id = _tenant_id AND e.created_at >= _from AND e.created_at < _to
  GROUP BY 1, e.provider, e.model;
$$;

REVOKE ALL ON FUNCTION public.get_ai_usage_by_feature(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ai_usage_by_user(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ai_usage_daily(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_by_feature(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_by_user(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_daily(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
