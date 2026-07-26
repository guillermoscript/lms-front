'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'
import { computeRevenueTotals } from '@/lib/payments/revenue-share'
import { netOfRefunds, roundMoney } from '@/lib/payments/payouts-owed'

async function verifyAdminAccess() {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')

  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    throw new Error('Only school admins can view revenue')
  }

  return { userId, tenantId, supabase }
}

export async function getRevenueOverview() {
  const { tenantId } = await verifyAdminAccess()
  const adminClient = await createAdminClient()

  // Get all successful transactions for this tenant. Paged and count-verified
  // (#548): everything this action returns — total revenue, platform fees,
  // per-product breakdown, the monthly trend — is a sum over this list, so a
  // read truncated at the API row cap would report a confidently wrong number
  // instead of an error. Ordered by the primary key so the paging windows
  // neither overlap nor skip.
  const transactions = await fetchAllRows('transactions', (from, to) =>
    adminClient
      .from('transactions')
      .select(
        'amount, refunded_amount, currency, transaction_date, product_id, plan_id, payment_provider, school_percentage_snapshot, stripe_payment_intent_id',
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'successful')
      .order('transaction_id')
      .range(from, to)
  )

  if (transactions.length === 0) {
    return {
      totalRevenue: 0,
      platformFees: 0,
      netRevenue: 0,
      transactionCount: 0,
      currency: 'usd',
      revenueByCourse: [],
      monthlyTrend: [],
    }
  }

  // The tenant's CURRENT split, used only for transactions with no snapshot.
  // `applies_to_providers` is deliberately no longer read (issue #547): it
  // stored the labels 'stripe'/'manual' rather than provider slugs, so every
  // PayPal / Lemon Squeezy / Binance sale fell outside it and was shown here
  // bearing no platform fee at all — while `getPayoutsOwed()` applied the full
  // split to those same rows. Whether a fee is taken is now a property of the
  // provider (`bearsPlatformFee`), and the rate comes from each transaction's
  // own snapshot, which is exactly what the payout view uses.
  const { data: split } = await adminClient
    .from('revenue_splits')
    .select('school_percentage')
    .eq('tenant_id', tenantId)
    .single()

  const { grossRevenue: totalRevenue, platformFees, netRevenue } = computeRevenueTotals(
    transactions.map((t) => ({
      amount: Number(t.amount),
      refundedAmount: t.refunded_amount as number | null,
      paymentProvider: t.payment_provider as string | null,
      stripePaymentIntentId: t.stripe_payment_intent_id as string | null,
      schoolPercentageSnapshot: t.school_percentage_snapshot as number | null,
    })),
    Number(split?.school_percentage ?? 80),
  )

  // Revenue by product/course
  const revenueByProduct: Record<number, number> = {}
  for (const tx of transactions) {
    const key = tx.product_id || tx.plan_id || 0
    // Net of refunds, like every other figure here (#547).
    revenueByProduct[key] = (revenueByProduct[key] || 0) + netOfRefunds(Number(tx.amount), tx.refunded_amount)
  }

  // Get product names. The id list is as long as the transaction set is
  // varied, so it is chunked as well as paged (#548) — an over-long `.in()`
  // fails on the request side, before any of the response paging matters.
  const productIds = [...new Set(transactions.map(t => t.product_id).filter(Boolean))]
  const products = await fetchAllRowsIn('products', productIds, (chunk, from, to) =>
    adminClient
      .from('products')
      .select('product_id, name', { count: 'exact' })
      .in('product_id', chunk)
      .order('product_id')
      .range(from, to)
  )

  const productMap = new Map(products.map(p => [p.product_id, p.name]))

  const revenueByCourse = Object.entries(revenueByProduct).map(([id, amount]) => ({
    id: Number(id),
    name: productMap.get(Number(id)) || `Product #${id}`,
    amount: roundMoney(amount),
  })).sort((a, b) => b.amount - a.amount)

  // Monthly trend (last 12 months)
  const monthlyMap: Record<string, number> = {}
  for (const tx of transactions) {
    const date = new Date(tx.transaction_date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = (monthlyMap[key] || 0) + netOfRefunds(Number(tx.amount), tx.refunded_amount)
  }

  const monthlyTrend = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({ month, amount: roundMoney(amount) }))

  return {
    totalRevenue,
    platformFees,
    netRevenue,
    transactionCount: transactions.length,
    currency: transactions[0]?.currency || 'usd',
    revenueByCourse,
    monthlyTrend,
  }
}
