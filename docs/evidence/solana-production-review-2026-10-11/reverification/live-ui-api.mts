import { chromium } from '/Users/guillermomarin/Documents/GitHub/lms-front/node_modules/playwright/index.mjs';
import { loginAsStudent, loginAsTeacher } from '/Users/guillermomarin/Documents/GitHub/lms-front/tests/playwright/utils/auth.ts';
import fs from 'node:fs/promises';
const root='/Users/guillermomarin/Documents/GitHub/lms-front';
const base='http://lvh.me:3018';
const browser=await chromium.launch({args:['--host-resolver-rules=MAP *.lvh.me 127.0.0.1, MAP lvh.me 127.0.0.1']});
const results:any={checkedAt:new Date().toISOString(),source:'LIVE local production UI/API; existing canceled subscription10002; no payment submitted',screenshots:[],denials:[]};
try {
 const ctx=await browser.newContext(); const page=await ctx.newPage();
 await loginAsStudent(page,base);
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const){
  await page.setViewportSize({width,height});
  await page.goto(base+'/en/dashboard/student/billing',{waitUntil:'networkidle'});
  const text=await page.locator('body').innerText();
  if(!text.includes('Canceled')||!text.includes('Paid access until')||!text.includes('ENDED SUBSCRIPTION')||!text.includes('This subscription has ended.'))throw new Error('Missing canceled paid-deadline billing state');
  if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)))throw new Error('Horizontal overflow');
  const path=root+'/docs/qa/solana-production-review-2026-10-11/'+name+'-live-canceled-billing.png';
  await page.screenshot({path,fullPage:true}); results.screenshots.push({name,path,canceled:true,paidDeadlineVisible:true,noHorizontalOverflow:true});
 }
 // Requests with no origin or foreign origin reject before provider work.
 for(const route of ['retry-renewal','cancel-tx','cancel-verify']){
  const r=await page.request.post(base+'/api/payments/solana/'+route,{headers:{origin:'https://foreign.invalid'},data:{subscriptionId:10002,recoveryOnly:true}});
  results.denials.push({case:'cross-origin',route,status:r.status()}); if(r.status()!==403)throw new Error('Cross-origin accepted: '+route);
 }
 // Use the authenticated owner on another school host; forge the original tenant.
 for(const forged of [false,true]) for(const route of ['retry-renewal','cancel-tx','cancel-verify']){
  const wrong='http://code-academy.lvh.me:3018';
  const r=await page.request.post(wrong+'/api/payments/solana/'+route,{headers:{origin:wrong,...(forged?{'x-tenant-id':'00000000-0000-0000-0000-000000000001'}:{})},data:{subscriptionId:10002,recoveryOnly:true}});
  results.denials.push({case:forged?'wrong-host-with-forged-tenant-header':'wrong-tenant-host',route,status:r.status()});
  if(![401,403,404].includes(r.status()))throw new Error('Wrong school accepted: '+route);
 }
 const teacherCtx=await browser.newContext(); const teacher=await teacherCtx.newPage();
 await loginAsTeacher(teacher,base);
 for(const route of ['retry-renewal','cancel-tx','cancel-verify']){
  const r=await teacher.request.post(base+'/api/payments/solana/'+route,{headers:{origin:base},data:{subscriptionId:10002,recoveryOnly:true}});
  results.denials.push({case:'wrong-owner',route,status:r.status()}); if(![403,404].includes(r.status()))throw new Error('Wrong owner accepted: '+route);
 }
 results.passed=true;
} catch(e){results.passed=false;results.error=e instanceof Error?e.message:String(e);process.exitCode=1;}
finally{await fs.writeFile(root+'/docs/evidence/solana-production-review-2026-10-11/reverification/live-ui-api.json',JSON.stringify(results,null,2));await browser.close();}
