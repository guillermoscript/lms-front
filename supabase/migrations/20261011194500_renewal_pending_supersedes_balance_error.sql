-- A funded retry supersedes the previous balance failure before submission.
-- Keep the durable pending marker until a confirmed receipt is persisted;
-- confirmation/storage failures must still offer reconciliation after reload.
BEGIN;
CREATE OR REPLACE FUNCTION public.begin_solana_renewal(
  _subscription_id integer, _period_start timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.subscriptions SET provider_metadata =
    (COALESCE(provider_metadata, '{}'::jsonb) - 'renewal_error') ||
    jsonb_build_object('renewal_pending', jsonb_build_object(
      'period_start', _period_start, 'attempted_at', now()))
  WHERE subscription_id = _subscription_id AND payment_provider = 'solana_subs'
    AND subscription_status IN ('active','past_due') AND NOT cancel_at_period_end
    AND (current_period_end IS NULL OR current_period_end <= _period_start);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_solana_renewal(integer,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_solana_renewal(integer,timestamptz) TO service_role;
COMMIT;
