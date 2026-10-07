-- A refunded image slot must not reset the cooldown: otherwise repeated failures bypass it.
CREATE OR REPLACE FUNCTION public.release_ai_image_generation(_tenant_id UUID, _user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ai_image_usage
  SET image_count = GREATEST(image_count - 1, 0)
  WHERE tenant_id = _tenant_id
    AND user_id = _user_id
    AND period_date = (now() AT TIME ZONE 'utc')::date;
$$;

REVOKE ALL ON FUNCTION public.release_ai_image_generation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_image_generation(UUID, UUID) TO service_role;
