// Local-dev only: seed a Solana test product (USDC + SOL enabled) on the default
// tenant so a human can exercise the checkout selector in a real browser.
// Goes through PostgREST (service role) — NOT docker exec — to avoid the wedged
// docker path. Run: node scripts/seed-solana-test-product.mjs
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  })
)
const TENANT = '00000000-0000-0000-0000-000000000001'
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const wallet = env.SOLANA_PLATFORM_WALLET
const sb = createClient(url, key, { auth: { persistSession: false } })

// 0. clean any prior 'Solana Test%' leftovers (idempotent re-run; avoids dupes)
const { data: oldProducts } = await sb.from('products').select('product_id').like('name', 'Solana Test%').eq('tenant_id', TENANT)
for (const p of oldProducts || []) {
  await sb.from('transactions').delete().eq('product_id', p.product_id)
  await sb.from('product_courses').delete().eq('product_id', p.product_id)
  await sb.from('products').delete().eq('product_id', p.product_id)
}
await sb.from('courses').delete().like('title', 'Solana Test%').eq('tenant_id', TENANT)

// 1. course
const { data: course, error: cErr } = await sb.from('courses')
  .insert({ tenant_id: TENANT, title: 'Solana Test Course', status: 'published' })
  .select('course_id').single()
if (cErr) throw cErr

// 2. product (one-time, solana)
const { data: product, error: pErr } = await sb.from('products')
  .insert({ tenant_id: TENANT, name: 'Solana Test Product', price: 35.00, currency: 'usd', payment_provider: 'solana' })
  .select('product_id').single()
if (pErr) throw pErr

// 3. link
const { error: lErr } = await sb.from('product_courses')
  .insert({ product_id: product.product_id, course_id: course.course_id, tenant_id: TENANT })
if (lErr) throw lErr

// 4. school wallet (idempotent-ish)
await sb.from('tenant_payment_wallets').upsert(
  { tenant_id: TENANT, provider: 'solana', wallet_address: wallet },
  { onConflict: 'tenant_id,provider' }
)

// 5. toggles: solana on + accept native SOL on (so both USDC and SOL appear)
for (const setting_key of ['solana_enabled', 'solana_accept_sol']) {
  await sb.from('tenant_settings').upsert(
    { tenant_id: TENANT, setting_key, setting_value: { enabled: true } },
    { onConflict: 'tenant_id,setting_key' }
  )
}

console.log(JSON.stringify({
  course_id: course.course_id,
  product_id: product.product_id,
  checkoutPath: `/en/checkout?courseId=${course.course_id}`,
}, null, 2))
