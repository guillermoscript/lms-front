import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadFeeStatement, STATEMENT_NUMBER_PATTERN } from '@/lib/billing/platform-fee-statement'
import { FeeStatementDocument } from '@/components/admin/platform-fees/fee-statement-document'

/**
 * Super-admin view of a school's platform fee statement (#929). `/platform/*`
 * is guarded by `checkSuperAdmin()` in proxy.ts and the platform layout. The
 * statement must belong to the tenant in the URL.
 */
export default async function PlatformFeeStatementPage({
  params,
}: {
  params: Promise<{ locale: string; tenantId: string; statementNumber: string }>
}) {
  const { locale, tenantId, statementNumber } = await params
  if (!STATEMENT_NUMBER_PATTERN.test(statementNumber)) notFound()

  const statement = await loadFeeStatement(createAdminClient(), statementNumber)
  if (!statement || statement.tenantId !== tenantId) notFound()

  const t = await getTranslations('platform.fees')
  return (
    <FeeStatementDocument
      statement={statement}
      locale={locale}
      backHref={`/${locale}/platform/tenants/${tenantId}`}
      backLabel={t('backToSchool')}
    />
  )
}
