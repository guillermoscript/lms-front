import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { loadFeeStatement, STATEMENT_NUMBER_PATTERN } from '@/lib/billing/platform-fee-statement'
import { FeeStatementDocument } from '@/components/admin/platform-fees/fee-statement-document'

/**
 * A school's frozen platform fee statement (#929, design 2.5), printable.
 * NON-FISCAL. Only an active admin of the owning school sees it; anyone else
 * gets the same 404 as a number that does not exist.
 */
export default async function FeeStatementPage({
  params,
}: {
  params: Promise<{ locale: string; statementNumber: string }>
}) {
  const { locale, statementNumber } = await params
  if (!STATEMENT_NUMBER_PATTERN.test(statementNumber)) notFound()

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const tenantId = await getCurrentTenantId()
  const admin = createAdminClient()

  // Authorize BEFORE loading the ledger behind the live status.
  const [{ data: membership }, { data: owner }] = await Promise.all([
    admin
      .from('tenant_users')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle(),
    admin.from('platform_fee_statements').select('tenant_id').eq('statement_number', statementNumber).maybeSingle(),
  ])
  if (!membership || membership.role !== 'admin' || !owner || owner.tenant_id !== tenantId) notFound()

  const statement = await loadFeeStatement(admin, statementNumber)
  if (!statement || statement.tenantId !== tenantId) notFound()

  return <FeeStatementDocument statement={statement} locale={locale} backHref={`/${locale}/dashboard/admin/earnings#platform-fees`} />
}
