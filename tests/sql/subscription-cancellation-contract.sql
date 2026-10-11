-- Local Supabase ONLY. Requires the inspected QA subscription 10002 and course
-- 1002 as templates. All isolated rows, clock/deadline simulation and synthetic
-- receipts roll back. This is a DB contract test, NOT a live provider payment.
BEGIN;
DO $$
DECLARE
  template public.subscriptions%rowtype;
  provider text;
  sid integer := 210011;
  course integer := 210011;
  pid integer := 1791732900;
  paid_end timestamptz := now() + interval '30 minutes';
  snapshot jsonb;
  signature jsonb := '["ROLLBACK-ONLY-SYNTHETIC-RECEIPT"]';
BEGIN
  SELECT * INTO STRICT template FROM public.subscriptions WHERE subscription_id = 10002;
  IF template.subscription_status <> 'canceled' THEN RAISE EXCEPTION 'Expected inspected canceled QA fixture'; END IF;
  IF EXISTS (SELECT 1 FROM public.courses WHERE course_id = course)
    OR EXISTS (SELECT 1 FROM public.subscriptions WHERE subscription_id BETWEEN sid AND sid+2)
    OR EXISTS (SELECT 1 FROM public.plans WHERE plan_id BETWEEN pid AND pid+2) THEN
    RAISE EXCEPTION 'Isolated fixture IDs already in use';
  END IF;
  INSERT INTO public.courses SELECT (jsonb_populate_record(NULL::public.courses,
    to_jsonb(c) || jsonb_build_object('course_id',course,'title','QA ROLLBACK ONLY subscription access','slug','qa-rollback-subscription-access'))).*
    FROM public.courses c WHERE course_id = 1002;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY entitlement_id) INTO snapshot FROM public.entitlements e
    WHERE source_type = 'product' AND user_id = template.user_id;

  FOREACH provider IN ARRAY ARRAY['stripe','solana_subs','paypal'] LOOP
    INSERT INTO public.plans SELECT (jsonb_populate_record(NULL::public.plans,
      to_jsonb(p) || jsonb_build_object('plan_id',pid,'plan_name','QA ROLLBACK ONLY '||provider,'provider_plan_id',NULL,
        'provider_price_id',NULL,'payment_provider',provider,
        'solana_period_hours',CASE WHEN provider='solana_subs' THEN 1 ELSE NULL END))).*
      FROM public.plans p WHERE plan_id = template.plan_id;
    INSERT INTO public.subscriptions SELECT (jsonb_populate_record(NULL::public.subscriptions,
      to_jsonb(template) || jsonb_build_object('subscription_id',sid,'plan_id',pid,'payment_provider',provider,
        'provider_subscription_id','QA-ROLLBACK-'||provider,'subscription_status','active',
        'current_period_start',now()-interval '30 minutes','current_period_end',paid_end,'end_date',paid_end,
        'cancel_at_period_end',false,'cancel_at',NULL,'canceled_at',NULL,'ended_at',NULL,'provider_metadata','{}'::jsonb))).*;
    INSERT INTO public.entitlements(user_id,tenant_id,course_id,source_type,source_id,status,expires_at)
      VALUES (template.user_id,template.tenant_id,course,'subscription',sid,'active',paid_end);
    IF NOT public.has_course_access(template.user_id,course) THEN RAISE EXCEPTION 'Missing initial subscription access'; END IF;
    PERFORM public.apply_subscription_cancellation(sid,false,CASE WHEN provider = 'paypal' THEN NULL ELSE paid_end END);
    PERFORM public.apply_subscription_cancellation(sid,false,paid_end-interval '1 hour'); -- duplicate/out-of-order
    IF NOT public.has_course_access(template.user_id,course) THEN RAISE EXCEPTION '% cancellation revoked paid access',provider; END IF;
    IF (SELECT current_period_end FROM public.subscriptions WHERE subscription_id=sid) <> paid_end THEN RAISE EXCEPTION 'Duplicate shrank paid period'; END IF;
    IF public.expire_subscription_if_due(sid,true) THEN RAISE EXCEPTION 'Stale expiry revoked a future paid period'; END IF;
    PERFORM public.apply_webhook_subscription_period(provider,'QA-RENEW-1','QA-ROLLBACK-'||provider,paid_end,false);
    PERFORM public.apply_webhook_subscription_period(provider,'QA-RENEW-2','QA-ROLLBACK-'||provider,paid_end-interval '10 minutes',false);
    PERFORM public.apply_webhook_subscription_period(provider,'QA-RENEW-1','QA-ROLLBACK-'||provider,paid_end,false);
    IF NOT (SELECT cancel_at_period_end FROM public.subscriptions WHERE subscription_id=sid) THEN RAISE EXCEPTION 'Renewal cleared cancellation'; END IF;
    IF NOT public.has_course_access(template.user_id,course) THEN RAISE EXCEPTION 'Out-of-order renewal revoked paid access'; END IF;
    -- Prepare an elapsed deadline to exercise the shared expiry job. No real
    -- provider clock or payment is being advanced by this SQL test.
    UPDATE public.subscriptions SET cancel_at=now()-interval '1 second',current_period_end=now()-interval '1 second',end_date=now()-interval '1 second' WHERE subscription_id=sid;
    UPDATE public.entitlements SET expires_at=now()-interval '1 second' WHERE source_type='subscription' AND source_id=sid;
    PERFORM public.handle_student_subscription_expiry();
    IF public.has_course_access(template.user_id,course) THEN RAISE EXCEPTION 'Ended subscription still grants access'; END IF;
    IF (SELECT status FROM public.entitlements WHERE source_type='subscription' AND source_id=sid) <> 'expired' THEN RAISE EXCEPTION 'Expiry trigger not applied'; END IF;
    PERFORM public.apply_webhook_subscription_period(provider,'QA-LATE-RENEW','QA-ROLLBACK-'||provider,paid_end,false);
    PERFORM public.apply_subscription_cancellation(sid,false,paid_end);
    IF (SELECT subscription_status FROM public.subscriptions WHERE subscription_id=sid) <> 'expired' THEN RAISE EXCEPTION 'Late event restored ended access'; END IF;
    IF public.has_course_access(template.user_id,course) THEN RAISE EXCEPTION 'Late event restored access'; END IF;
    DELETE FROM public.entitlements WHERE source_type='subscription' AND source_id=sid;
    sid:=sid+1;pid:=pid+1;
  END LOOP;

  -- Cancel first while an already-paid renewal's receipt is delayed. The chain /
  -- provider confirmed a later cancellation limit, so the paid write repairs
  -- access inside that verified limit without clearing the schedule.
  sid:=210012;
  UPDATE public.subscriptions SET subscription_status='active',ended_at=NULL,cancel_at_period_end=false,cancel_at=NULL,
    current_period_end=paid_end,end_date=paid_end,provider_metadata='{}'::jsonb WHERE subscription_id=sid;
  INSERT INTO public.entitlements(user_id,tenant_id,course_id,source_type,source_id,status,expires_at)
    VALUES(template.user_id,template.tenant_id,course,'subscription',sid,'active',paid_end);
  UPDATE public.subscriptions SET provider_metadata=jsonb_build_object('renewal_error',jsonb_build_object('code','insufficient_funds')) WHERE subscription_id=sid;
  IF NOT public.begin_solana_renewal(sid,paid_end) THEN RAISE EXCEPTION 'Funded retry did not begin'; END IF;
  IF (SELECT provider_metadata ? 'renewal_error' OR NOT provider_metadata ? 'renewal_pending' FROM public.subscriptions WHERE subscription_id=sid) THEN
    RAISE EXCEPTION 'Pending retry retained stale balance failure or lost pending marker';
  END IF;
  PERFORM public.apply_subscription_cancellation(sid,false,paid_end+interval '1 hour');
  PERFORM public.record_solana_renewal(sid,paid_end,paid_end+interval '1 hour',0.01,true,signature,NULL,'devnet');
  IF (SELECT expires_at FROM public.entitlements WHERE source_type='subscription' AND source_id=sid) <> paid_end+interval '1 hour' THEN RAISE EXCEPTION 'Delayed paid receipt lost valid access'; END IF;
  IF NOT (SELECT cancel_at_period_end FROM public.subscriptions WHERE subscription_id=sid) THEN RAISE EXCEPTION 'Receipt resumed charging'; END IF;
  PERFORM public.apply_subscription_cancellation(sid,true);
  PERFORM public.record_solana_renewal(sid,paid_end+interval '1 hour',paid_end+interval '2 hours',0.01,true,'["ROLLBACK-ONLY-SYNTHETIC-LATE-RECEIPT"]',NULL,'devnet');
  IF public.has_course_access(template.user_id,course) THEN RAISE EXCEPTION 'Late receipt restored explicitly terminated access'; END IF;
  IF snapshot IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e) ORDER BY entitlement_id) FROM public.entitlements e WHERE source_type='product' AND user_id=template.user_id) THEN RAISE EXCEPTION 'Independent product entitlement changed'; END IF;
  IF NOT public.has_course_access(template.user_id,1002) THEN RAISE EXCEPTION 'Independent product access lost'; END IF;
  IF has_function_privilege('authenticated','public.apply_subscription_cancellation(integer,boolean,timestamptz)','EXECUTE')
    OR has_function_privilege('authenticated','public.apply_paid_subscription_period(integer,timestamptz,timestamptz,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Student can mutate privileged subscription access'; END IF;
  RAISE NOTICE 'PASS: shared cancellation, exclusive access, deadline expiry, duplicates, out-of-order, delayed receipts, immediate termination, independent product, privileges';
END $$;
ROLLBACK;
