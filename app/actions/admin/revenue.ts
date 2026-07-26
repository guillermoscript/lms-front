'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'

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
        'amount, currency, transaction_date, product_id, plan_id, stripe_payment_intent_id',
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

  // Get current revenue split config (rate + which providers it applies to)
  const { data: split } = await adminClient
    .from('revenue_splits')
    .select('platform_percentage, applies_to_providers')
    .eq('tenant_id', tenantId)
    .single()

  const platformPercentage = Number(split?.platform_percentage ?? 20)
  const appliesTo: string[] = split?.applies_to_providers ?? ['stripe']

  const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0)

  // The platform fee is only taken on sales through providers in
  // `applies_to_providers`. Stripe Connect collects it via
  // `application_fee_amount`; manual/offline sales settle directly to the
  // school, so no platform fee is taken on them — counting them would
  // overstate platform fees and understate the school's net revenue.
  const feeBearingRevenue = transactions.reduce((sum, t) => {
    const provider = t.stripe_payment_intent_id ? 'stripe' : 'manual'
    return appliesTo.includes(provider) ? sum + Number(t.amount) : sum
  }, 0)
  const platformFees = feeBearingRevenue * (platformPercentage / 100)
  const netRevenue = totalRevenue - platformFees

  // Revenue by product/course
  const revenueByProduct: Record<number, number> = {}
  for (const tx of transactions) {
    const key = tx.product_id || tx.plan_id || 0
    revenueByProduct[key] = (revenueByProduct[key] || 0) + Number(tx.amount)
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
    amount,
  })).sort((a, b) => b.amount - a.amount)

  // Monthly trend (last 12 months)
  const monthlyMap: Record<string, number> = {}
  for (const tx of transactions) {
    const date = new Date(tx.transaction_date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = (monthlyMap[key] || 0) + Number(tx.amount)
  }

  const monthlyTrend = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({ month, amount }))

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
