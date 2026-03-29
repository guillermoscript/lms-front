'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

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

  // Get all successful transactions for this tenant
  const { data: transactions } = await adminClient
    .from('transactions')
    .select('amount, currency, created_at, product_id, plan_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'successful')

  if (!transactions || transactions.length === 0) {
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

  // Get current revenue split
  const { data: split } = await adminClient
    .from('revenue_splits')
    .select('platform_percentage')
    .eq('tenant_id', tenantId)
    .single()

  const platformPercentage = split?.platform_percentage || 20
  const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
  const platformFees = totalRevenue * (platformPercentage / 100)
  const netRevenue = totalRevenue - platformFees

  // Revenue by product/course
  const revenueByProduct: Record<number, number> = {}
  for (const tx of transactions) {
    const key = tx.product_id || tx.plan_id || 0
    revenueByProduct[key] = (revenueByProduct[key] || 0) + Number(tx.amount)
  }

  // Get product names
  const productIds = [...new Set(transactions.map(t => t.product_id).filter(Boolean))]
  const { data: products } = productIds.length > 0
    ? await adminClient
        .from('products')
        .select('product_id, name')
        .in('product_id', productIds)
    : { data: [] }

  const productMap = new Map((products || []).map(p => [p.product_id, p.name]))

  const revenueByCourse = Object.entries(revenueByProduct).map(([id, amount]) => ({
    id: Number(id),
    name: productMap.get(Number(id)) || `Product #${id}`,
    amount,
  })).sort((a, b) => b.amount - a.amount)

  // Monthly trend (last 12 months)
  const monthlyMap: Record<string, number> = {}
  for (const tx of transactions) {
    const date = new Date(tx.created_at)
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
