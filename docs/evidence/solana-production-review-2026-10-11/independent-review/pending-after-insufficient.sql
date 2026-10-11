-- Rollback-only local contract reproduction: no payment or chain mutation.
BEGIN;
DO $$
DECLARE boundary timestamptz := date_trunc('second', now()) - interval '1 minute';
BEGIN
 IF EXISTS (SELECT 1 FROM public.subscriptions WHERE subscription_id=219095) THEN RAISE EXCEPTION 'Fixture ID already in use'; END IF;
 IF EXISTS (SELECT 1 FROM public.plans WHERE plan_id=1791732915) THEN RAISE EXCEPTION 'Fixture plan already in use'; END IF;
 INSERT INTO public.plans SELECT (jsonb_populate_record(NULL::public.plans,to_jsonb(p)||jsonb_build_object(
   'plan_id',1791732915,'name','QA ROLLBACK ONLY pending renewal review','provider_price_id',NULL,'provider_product_id',NULL))).*
 FROM public.plans p WHERE plan_id=1791732752;
 INSERT INTO public.subscriptions SELECT (jsonb_populate_record(NULL::public.subscriptions,
   to_jsonb(s)||jsonb_build_object('subscription_id',219095,'plan_id',1791732915,'provider_subscription_id','QA-PENDING-REVIEW-219095',
     'subscription_status','active','cancel_at_period_end',false,'cancel_at',NULL,'canceled_at',NULL,'ended_at',NULL,
     'current_period_end',boundary,'end_date',boundary,
     'provider_metadata',s.provider_metadata-'renewal_error'-'renewal_pending'-'cancellation_deadline'))).*
 FROM public.subscriptions s WHERE subscription_id=10002;
 PERFORM public.record_solana_renewal(219095,boundary,boundary+interval '1 hour',0.01,false,'[]'::jsonb,'insufficient_funds','devnet');
 IF NOT public.begin_solana_renewal(219095,boundary) THEN RAISE EXCEPTION 'Attempt not allowed'; END IF;
END $$;
SELECT subscription_status,
 provider_metadata->'renewal_error'->>'code' AS old_error,
 provider_metadata ? 'renewal_pending' AS pending_attempt_exists,
 NOT(provider_metadata->'renewal_error'->>'code'='insufficient_funds')
   AND (provider_metadata ? 'renewal_pending' OR current_period_end <= now()) AS billing_confirmation_unresolved,
 (SELECT status FROM public.transactions t WHERE t.provider_subscription_id=s.provider_subscription_id LIMIT 1) AS history_status
FROM public.subscriptions s WHERE subscription_id=219095;
ROLLBACK;
