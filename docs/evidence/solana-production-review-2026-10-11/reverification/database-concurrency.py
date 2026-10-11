import subprocess, concurrent.futures, time
cmd=['docker','exec','-i','supabase_db_lms-front','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At']
def sql(s):
 r=subprocess.run(cmd,input=s,text=True,capture_output=True,timeout=20)
 print(r.stdout, end='')
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout
sid=219091
created=False
try:
 sql('''BEGIN;
 INSERT INTO public.courses SELECT (jsonb_populate_record(NULL::public.courses,to_jsonb(c)||jsonb_build_object('course_id',219091,'title','QA CONCURRENCY ONLY','slug','qa-concurrency-only-219091'))).* FROM public.courses c WHERE course_id=1002;
 INSERT INTO public.plans SELECT (jsonb_populate_record(NULL::public.plans,to_jsonb(p)||jsonb_build_object('plan_id',2000000091,'plan_name','QA CONCURRENCY ONLY','provider_plan_id',NULL,'provider_price_id',NULL,'payment_provider','stripe','solana_period_hours',NULL))).* FROM public.plans p JOIN public.subscriptions s ON s.plan_id=p.plan_id WHERE s.subscription_id=10002;
 INSERT INTO public.subscriptions SELECT (jsonb_populate_record(NULL::public.subscriptions,to_jsonb(s)||jsonb_build_object('subscription_id',219091,'plan_id',2000000091,'payment_provider','stripe','provider_subscription_id','QA-CONCURRENCY-219091','subscription_status','active','cancel_at_period_end',false,'cancel_at',NULL,'canceled_at',NULL,'ended_at',NULL,'provider_metadata','{}'::jsonb,'current_period_end',now()+interval '30 minutes','end_date',now()+interval '30 minutes'))).* FROM public.subscriptions s WHERE subscription_id=10002;
 INSERT INTO public.entitlements(user_id,tenant_id,course_id,source_type,source_id,status,expires_at) SELECT user_id,tenant_id,219091,'subscription',subscription_id,'active',current_period_end FROM public.subscriptions WHERE subscription_id=219091;
 COMMIT;''')
 created=True
 def race(first,second):
  # Session A signals after acquiring its row lock; B then waits on that lock.
  a=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  a.stdin.write('BEGIN;'+first+";SELECT 'ROW_LOCK_HELD';SELECT pg_sleep(1);COMMIT;\n")
  a.stdin.close()
  while True:
   line=a.stdout.readline()
   if not line: raise RuntimeError(a.stderr.read())
   if line.strip()=='ROW_LOCK_HELD': break
  start=time.monotonic()
  result=sql(second+';')
  a.wait(timeout=15)
  if a.returncode: raise RuntimeError(a.stderr.read())
  assert time.monotonic()-start > .5, 'Second session did not wait on row lock'
  return result
 # Cancel wins first; a verified paid renewal must preserve the cancellation.
 race("SELECT public.apply_subscription_cancellation(219091)","SELECT public.apply_paid_subscription_period(219091,now()+interval '1 hour')")
 sql("DO $$BEGIN IF NOT (SELECT cancel_at_period_end AND current_period_end>now()+interval '50 minutes' FROM public.subscriptions WHERE subscription_id=219091) THEN RAISE EXCEPTION 'cancel-first lost paid period or resumed billing';END IF;END$$;")
 # Renewal wins first; cancellation reads the updated paid period under its lock.
 sql("UPDATE public.subscriptions SET cancel_at_period_end=false,cancel_at=NULL,canceled_at=NULL WHERE subscription_id=219091;")
 race("SELECT public.apply_paid_subscription_period(219091,now()+interval '2 hours')","SELECT public.apply_subscription_cancellation(219091)")
 sql("DO $$BEGIN IF NOT (SELECT cancel_at_period_end AND cancel_at>now()+interval '110 minutes' FROM public.subscriptions WHERE subscription_id=219091) THEN RAISE EXCEPTION 'renewal-first lost paid period';END IF;END$$;")
 # Expiry queued on a stale deadline waits for renewal and rechecks the new end.
 sql("UPDATE public.subscriptions SET cancel_at=now()-interval '1 second',current_period_end=now()-interval '1 second',end_date=now()-interval '1 second' WHERE subscription_id=219091;")
 result=race("SELECT public.apply_paid_subscription_period(219091,now()+interval '1 hour')","SELECT public.expire_subscription_if_due(219091)")
 assert result.strip()=='f', 'Stale expiry revoked renewed access'
 # Explicit termination wins; the delayed paid write must not resurrect access.
 result=race("SELECT public.apply_subscription_cancellation(219091,true)","SELECT public.apply_paid_subscription_period(219091,now()+interval '3 hours')")
 assert result.strip()=='f', 'Late renewal restored terminal access'
 sql("DO $$BEGIN IF (SELECT public.has_course_access(user_id,219091) FROM public.subscriptions WHERE subscription_id=219091) THEN RAISE EXCEPTION 'Terminal access restored';END IF;END$$;")
 print('PASS: real concurrent PostgreSQL sessions; both cancel/renew orders, stale expiry, terminal access guard. Synthetic paid periods; no provider payment.')
finally:
 if created:
  sql("BEGIN;DELETE FROM public.entitlements WHERE source_type='subscription' AND source_id=219091;DELETE FROM public.subscriptions WHERE subscription_id=219091;DELETE FROM public.plans WHERE plan_id=2000000091;DELETE FROM public.courses WHERE course_id=219091;COMMIT;")
  print('Isolated fixtures removed; subscription 10002 unchanged.')
