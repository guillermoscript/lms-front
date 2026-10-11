import {chromium} from '/Users/guillermomarin/Documents/GitHub/lms-front/node_modules/playwright/index.mjs';
import {loginAsStudent} from '/Users/guillermomarin/Documents/GitHub/lms-front/tests/playwright/utils/auth.ts';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
const root='/Users/guillermomarin/Documents/GitHub/lms-front',base='http://lvh.me:3018';
function sql(input:string){return execFileSync('docker',['exec','-i','supabase_db_lms-front','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8'});}
const result:any={source:'Real local production page + manually prepared isolated DB state + mocked retry API. No Devnet payment.',checks:[]};
let created=false;const browser=await chromium.launch({args:['--host-resolver-rules=MAP *.lvh.me 127.0.0.1, MAP lvh.me 127.0.0.1']});
try {
 sql(`BEGIN;
 INSERT INTO public.plans SELECT (jsonb_populate_record(NULL::public.plans,to_jsonb(p)||jsonb_build_object('plan_id',2000000092,'plan_name','QA PREPARED pending regression - no payment','provider_plan_id',NULL,'provider_price_id',NULL))).* FROM public.plans p JOIN public.subscriptions s ON s.plan_id=p.plan_id WHERE s.subscription_id=10002;
 INSERT INTO public.subscriptions SELECT (jsonb_populate_record(NULL::public.subscriptions,to_jsonb(s)||jsonb_build_object('subscription_id',219092,'plan_id',2000000092,'provider_subscription_id','QA-PREPARED-PENDING-219092','subscription_status','past_due','cancel_at_period_end',false,'cancel_at',NULL,'canceled_at',NULL,'ended_at',NULL,'created',now(),'current_period_end',now()-interval '1 second','end_date',now()-interval '1 second','provider_metadata',jsonb_build_object('renewal_error',jsonb_build_object('code','insufficient_funds'))))).* FROM public.subscriptions s WHERE subscription_id=10002;
 COMMIT;`);created=true;
 const ctx=await browser.newContext();const page=await ctx.newPage();await loginAsStudent(page,base);
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const){
  sql(`UPDATE public.subscriptions SET provider_metadata=jsonb_build_object('renewal_error',jsonb_build_object('code','insufficient_funds')) WHERE subscription_id=219092;`);
  await page.setViewportSize({width,height});await page.goto(base+'/en/dashboard/student/billing',{waitUntil:'networkidle'});
  await page.getByText('Not enough USDC to renew',{exact:true}).waitFor();
  await page.route('**/api/payments/solana/retry-renewal',r=>r.fulfill({status:422,json:{status:'insufficient_funds',amount:0.01,balance:'0'}}));
  await page.getByRole('button',{name:'Retry payment',exact:true}).click();
  await page.getByRole('status').filter({hasText:'0.01'}).waitFor();
  // A funded attempt writes the durable marker before submission; no submission here.
  const began=sql(`SELECT public.begin_solana_renewal(219092,current_period_end) FROM public.subscriptions WHERE subscription_id=219092;`).trim();
  if(began!=='t')throw new Error('Pending attempt did not persist');
  // Simulate legacy metadata or an out-of-order balance failure alongside pending.
  sql(`UPDATE public.subscriptions SET provider_metadata=provider_metadata||jsonb_build_object('renewal_error',jsonb_build_object('code','insufficient_funds')) WHERE subscription_id=219092;`);
  await page.unroute('**/api/payments/solana/retry-renewal');
  const requests:any[]=[];await page.route('**/api/payments/solana/retry-renewal',r=>{requests.push(r.request().postDataJSON());return r.fulfill({status:503,json:{status:'unconfirmed'}});});
  await page.reload({waitUntil:'networkidle'});
  await page.getByText('Payment confirmation unresolved',{exact:true}).waitFor();
  if(await page.getByRole('button',{name:'Retry payment',exact:true}).count())throw new Error('Reload offered debit instead of recovery');
  if(await page.getByText('Not enough USDC to renew',{exact:true}).count())throw new Error('Stale balance error hid pending state');
  await page.getByRole('button',{name:'Check payment',exact:true}).click();
  await page.getByRole('button',{name:'Check payment',exact:true}).waitFor();
  if(!requests.length||requests.some(r=>r.recoveryOnly!==true))throw new Error('Recovery request could debit');
  const path=root+'/docs/qa/solana-production-review-2026-10-11/'+name+'-prepared-pending-after-insufficient.png';await page.screenshot({path,fullPage:true});
  result.checks.push({name,passed:true,afterReload:true,oldErrorPresentInDb:true,recoveryOnly:true,screenshot:path});
  await page.unroute('**/api/payments/solana/retry-renewal');
 }
 result.passed=true;
}catch(e){result.passed=false;result.error=e instanceof Error?e.message:String(e);process.exitCode=1;}
finally{if(created){sql('BEGIN;DELETE FROM public.entitlements WHERE source_type=\'subscription\' AND source_id=219092;DELETE FROM public.subscriptions WHERE subscription_id=219092;DELETE FROM public.plans WHERE plan_id=2000000092;COMMIT;');result.fixturesRemoved=true;}await browser.close();await fs.writeFile(root+'/docs/evidence/solana-production-review-2026-10-11/pending-and-scheduler/prepared-page-regression.json',JSON.stringify(result,null,2));}
