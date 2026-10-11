import { test, expect } from '@playwright/test'
import path from 'node:path'
// Requires the isolated component harness described in the QA report at :3017.
// API responses are explicitly mocked. No Supabase row or Devnet state is used.
test.skip(process.env.SOLANA_COMPONENT_QA !== '1', 'Requires the isolated component harness, not the live LMS')
const base = process.env.SOLANA_COMPONENT_QA_URL ?? 'http://127.0.0.1:3017'
const evidence = path.resolve('docs/qa/solana-production-review-2026-10-11')
for (const [name, width, height] of [['desktop',1440,1000],['mobile',390,844]] as const) {
  test(`${name} ended access does not promise continued access`, async ({page}) => {
    await page.setViewportSize({width,height})
    await page.goto(`${base}/?state=ended`)
    await expect(page.getByText('This subscription has ended.',{exact:false})).toBeVisible()
    await expect(page.getByText('Subscription access continues',{exact:false})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Check payment',exact:true})).toHaveCount(0)
  })
  test(`${name} scheduled cancellation keeps deadline visible`, async ({page}) => {
    await page.setViewportSize({width,height})
    await page.goto(`${base}/?state=canceled`)
    await expect(page.getByText('Future renewals stopped')).toBeVisible()
    await expect(page.getByText('Paid access until')).toBeVisible()
    await expect(page.locator('time')).toContainText('2030')
    await expect(page.getByRole('button',{name:'Retry payment',exact:true})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Check payment',exact:true})).toHaveCount(0)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await page.screenshot({path:path.join(evidence,`${name}-canceled-component.png`),fullPage:true})
  })
  test(`${name} confirmation uncertainty uses reconciliation only, including repeated checks`, async ({page}) => {
    await page.setViewportSize({width,height})
    const requests: {recoveryOnly?:boolean}[]=[]
    await page.route('**/api/payments/solana/retry-renewal',async route=>{
      requests.push(route.request().postDataJSON())
      await route.fulfill({status:503,json:{status:'unconfirmed'}})
    })
    await page.goto(`${base}/?state=pending`)
    await expect(page.getByText('Payment confirmation unresolved')).toBeVisible()
    await expect(page.getByText('Payment may already have landed.',{exact:false})).toBeVisible()
    await page.getByRole('button',{name:'Check payment',exact:true}).click()
    await expect(page.getByRole('status').filter({hasText:'Payment may already have landed.'})).toBeVisible()
    await page.getByRole('button',{name:'Check payment',exact:true}).click()
    await expect.poll(()=>requests.length).toBe(2)
    expect(requests.every(request=>request.recoveryOnly===true)).toBe(true)
    await expect(page.getByRole('button',{name:'Check payment',exact:true})).toBeEnabled()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await page.screenshot({path:path.join(evidence,`${name}-uncertain-component.png`),fullPage:true})
  })
}
test('insufficient balance recovery switches to a safe check after transport uncertainty',async({page})=>{
  await page.route('**/api/payments/solana/retry-renewal',route=>route.abort('connectionfailed'))
  await page.goto(`${base}/?state=insufficient`)
  await page.getByRole('button',{name:'Retry payment',exact:true}).click()
  await expect(page.getByRole('button',{name:'Check payment',exact:true})).toBeVisible()
  await expect(page.getByText('Payment confirmation unresolved')).toBeVisible()
})
