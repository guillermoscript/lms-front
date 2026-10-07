-- BYOK U17: durable per-user daily cap for MCP AI image generation.
-- Replaces the MCP server's in-memory Map (per process, reset on restart). The
-- school pays its own provider, so this is an abuse brake, not a billing
-- control. Written only through the SECURITY DEFINER functions below, which
-- only service_role can execute (the internal image route calls them).

CREATE TABLE public.ai_image_usage (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  image_count INTEGER NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  last_reserved_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, user_id, period_date)
);

COMMENT ON TABLE public.ai_image_usage IS
  'One row per (tenant, user, UTC day) counting AI image generations. Written only through reserve_ai_image_generation()/release_ai_image_generation() (service role).';

ALTER TABLE public.ai_image_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_image_usage FROM anon, authenticated;
GRANT ALL ON public.ai_image_usage TO service_role;

-- Atomic check-and-reserve. `_daily_cap` <= 0 means unlimited (cooldown still
-- applies). Returns {allowed, reason?, used, cap}; reason is 'cooldown' or
-- 'daily_limit'.
CREATE OR REPLACE FUNCTION public.reserve_ai_image_generation(
  _tenant_id UUID,
  _user_id UUID,
  _daily_cap INTEGER,
  _cooldown_seconds INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _today DATE := (now() AT TIME ZONE 'utc')::date;
  _row public.ai_image_usage%ROWTYPE;
BEGIN
  INSERT INTO public.ai_image_usage (tenant_id, user_id, period_date)
  VALUES (_tenant_id, _user_id, _today)
  ON CONFLICT DO NOTHING;

  SELECT * INTO _row
  FROM public.ai_image_usage
  WHERE tenant_id = _tenant_id AND user_id = _user_id AND period_date = _today
  FOR UPDATE;

  IF _row.last_reserved_at IS NOT NULL
     AND _cooldown_seconds > 0
     AND now() - _row.last_reserved_at < make_interval(secs => _cooldown_seconds) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'cooldown', 'used', _row.image_count, 'cap', _daily_cap);
  END IF;

  IF _daily_cap > 0 AND _row.image_count >= _daily_cap THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'used', _row.image_count, 'cap', _daily_cap);
  END IF;

  UPDATE public.ai_image_usage
  SET image_count = image_count + 1, last_reserved_at = now()
  WHERE tenant_id = _tenant_id AND user_id = _user_id AND period_date = _today;

  RETURN jsonb_build_object('allowed', true, 'used', _row.image_count + 1, 'cap', _daily_cap);
END;
$$;

-- Gives the slot back when the generation failed before it could be billed.
CREATE OR REPLACE FUNCTION public.release_ai_image_generation(_tenant_id UUID, _user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ai_image_usage
  SET image_count = GREATEST(image_count - 1, 0), last_reserved_at = NULL
  WHERE tenant_id = _tenant_id
    AND user_id = _user_id
    AND period_date = (now() AT TIME ZONE 'utc')::date;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_image_generation(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_image_generation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_image_generation(UUID, UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_image_generation(UUID, UUID) TO service_role;
