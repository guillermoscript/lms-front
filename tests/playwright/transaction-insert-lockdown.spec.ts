/**
 * `transactions` INSERT lockdown — issue #538 (follow-up to #528).
 *
 * #528 pinned `status = 'pending'` on the user-scoped INSERT policy, which closed
 * self-declared payment but left the rest of the row caller-controlled. The
 * Solana settlement columns are what a pending row claims it OWES, and both
 * Solana paths verify against them (`lib/payments/solana-reconcile.ts` builds
 * `verifySplitTransfer({ totalBase })` from `settlement_base`), so a student could
 * insert a pending row for a $49 product claiming it owed 1 lamport, pay that, and
 * be enrolled by the verify endpoint.
 *
 * 20260725180000 revokes the INSERT grant outright instead of chasing columns,
 * because nothing in the browser inserts into `transactions` — every legitimate
 * insert is server-side. These tests pin both halves of that:
 *
 *   negative — a signed-in student cannot insert into `transactions` at all,
 *              under-quoted or honest, via PostgREST
 *   positive — /api/payments/checkout still creates the pending row (it writes on
 *              the admin client now), with the financial fields derived from the
 *              product rather than from the request
 *
 * The positive case uses `binance_personal`, whose createCheckoutSession is purely
 * local (it returns transfer instructions), so the full route runs with no
 * external payment API or network dependency.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsTenantStudent } from './utils/auth'
import { ACCOUNTS, TENANT_BASE } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const PRICED_PRODUCT = 2001 // Python Mastery Bundle, $49 — the under-quote target

const QA_PRODUCT_NAME = '[E2E] 538 Binance Personal Product'
const QA_PRICE = 42
const QA_PAY_ID = 'e2e-538-pay-id'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** A student-scoped client — role `authenticated`, exactly what a browser holds. */
async function getStudentClient() {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await client.auth.signInWithPassword({
    email: ACCOUNTS.tenantStudent.email,
    password: ACCOUNTS.tenantStudent.password,
  })
  expect(error).toBeNull()
  return client
}

let qaProductId: number
let walletPreexisting = false

test.beforeAll(async () => {
  const admin = getAdmin()

  // Clean up anything a failed run left behind.
  const { data: stale } = await admin
    .from('products')
    .select('product_id')
    .eq('name', QA_PRODUCT_NAME)
  for (const row of stale ?? []) {
    await admin.from('transactions').delete().eq('product_id', row.product_id)
  }
  await admin.from('products').delete().eq('name', QA_PRODUCT_NAME)

  const { data: product, error: productError } = await admin
    .from('products')
    .insert({
      name: QA_PRODUCT_NAME,
      description: 'Issue #538 regression fixture.',
      price: QA_PRICE,
      currency: 'usd',
      payment_provider: 'binance_personal',
      tenant_id: CODE_ACADEMY_TENANT,
    })
    .select('product_id')
    .single()
  expect(productError).toBeNull()
  qaProductId = product!.product_id

  // binance_personal resolves the school's Pay ID before creating the pending
  // row, so the wallet has to exist or the route 400s before the insert.
  const { data: wallet } = await admin
    .from('tenant_payment_wallets')
    .select('wallet_address')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('provider', 'binance_personal')
    .maybeSingle()
  walletPreexisting = !!wallet
  if (!walletPreexisting) {
    const { error: walletError } = await admin
      .from('tenant_payment_wallets')
      .insert({
        tenant_id: CODE_ACADEMY_TENANT,
        provider: 'binance_personal',
        wallet_address: QA_PAY_ID,
      })
    expect(walletError).toBeNull()
  }
})

test.afterAll(async () => {
  const admin = getAdmin()
  if (qaProductId) {
    await admin.from('transactions').delete().eq('product_id', qaProductId)
    await admin.from('products').delete().eq('product_id', qaProductId)
  }
  if (!walletPreexisting) {
    await admin
      .from('tenant_payment_wallets')
      .delete()
      .eq('tenant_id', CODE_ACADEMY_TENANT)
      .eq('provider', 'binance_personal')
      .eq('wallet_address', QA_PAY_ID)
  }
})

test.describe('transactions INSERT is closed to authenticated (#538)', () => {
  test('the under-quoted Solana row from the issue is rejected', async () => {
    const student = await getStudentClient()

    const { data, error } = await student
      .from('transactions')
      .insert({
        user_id: ALICE_ID,
        tenant_id: CODE_ACADEMY_TENANT,
        product_id: PRICED_PRODUCT,
        amount: 100,
        currency: 'usd',
        status: 'pending',
        payment_provider: 'solana',
        settlement_currency: 'sol',
        settlement_base: 1, // one lamport for a $49 course
      })
      .select('transaction_id')

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    // 42501: `permission denied for table transactions` from the revoked grant.
    // If the grant is ever restored, the retained INSERT policy reports the same
    // SQLSTATE with `new row violates row-level security policy`, so this
    // assertion holds for either layer — which is the point of keeping both.
    expect(error!.code).toBe('42501')

    // Nothing landed, so the verify endpoint has nothing to confirm.
    const admin = getAdmin()
    const { data: rows } = await admin
      .from('transactions')
      .select('transaction_id')
      .eq('user_id', ALICE_ID)
      .eq('product_id', PRICED_PRODUCT)
      .eq('settlement_base', 1)
    expect(rows ?? []).toHaveLength(0)
  })

  test('even an honest pending row is rejected — the grant is gone, not narrowed', async () => {
    const student = await getStudentClient()

    const { error } = await student
      .from('transactions')
      .insert({
        user_id: ALICE_ID,
        tenant_id: CODE_ACADEMY_TENANT,
        product_id: PRICED_PRODUCT,
        amount: 49,
        currency: 'usd',
        status: 'pending',
      })
      .select('transaction_id')

    expect(error?.code).toBe('42501')
  })
})

test.describe('the legitimate checkout path still creates the row (#538)', () => {
  test('/api/payments/checkout inserts a pending transaction priced from the product', async ({
    page,
  }) => {
    await loginAsTenantStudent(page)

    const response = await page.request.post(
      `${TENANT_BASE}/api/payments/checkout`,
      { data: { productId: qaProductId } }
    )
    expect(response.status(), await response.text()).toBe(200)
    const body = await response.json()
    expect(body.kind).toBe('instructions')

    const admin = getAdmin()
    const { data: tx } = await admin
      .from('transactions')
      .select(
        'transaction_id, user_id, tenant_id, amount, currency, status, payment_provider, school_percentage_snapshot, settlement_base, settlement_currency, settlement_mint, settlement_sol_usd'
      )
      .eq('product_id', qaProductId)
      .single()

    expect(tx).not.toBeNull()
    expect(tx!.user_id).toBe(ALICE_ID)
    expect(tx!.tenant_id).toBe(CODE_ACADEMY_TENANT)
    expect(tx!.status).toBe('pending')
    expect(tx!.payment_provider).toBe('binance_personal')
    // Priced from `products.price`, never from the request body.
    expect(Number(tx!.amount)).toBe(QA_PRICE)
    expect(tx!.currency).toBe('usd')
    // #512's snapshot trigger still runs on an admin-client insert.
    expect(tx!.school_percentage_snapshot).not.toBeNull()
    // Non-Solana provider: no settlement claim at all.
    expect(tx!.settlement_base).toBeNull()
    expect(tx!.settlement_currency).toBeNull()
    expect(tx!.settlement_mint).toBeNull()
    expect(tx!.settlement_sol_usd).toBeNull()
  })

  test('the route rejects a product from another tenant', async ({ page }) => {
    await loginAsTenantStudent(page)

    // Product 1001 belongs to the Default School. The price/provider lookup runs
    // on the user-scoped client filtered by the x-tenant-id tenant, so the admin
    // client never gets the chance to write a cross-tenant row.
    const response = await page.request.post(
      `${TENANT_BASE}/api/payments/checkout`,
      { data: { productId: 1001 } }
    )
    expect(response.status()).toBe(404)

    const admin = getAdmin()
    const { data: rows } = await admin
      .from('transactions')
      .select('transaction_id')
      .eq('user_id', ALICE_ID)
      .eq('product_id', 1001)
    expect(rows ?? []).toHaveLength(0)
  })
})
