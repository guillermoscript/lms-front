import { getTranslations } from 'next-intl/server'
import { IconAlertTriangle, IconBuildingBank } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { listAllBankAccounts, type PlatformBankAccount } from '@/lib/billing/platform-bank-accounts'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { PlatformPanel } from '@/components/platform/section'
import { PlatformEmptyState } from '@/components/platform/empty-state'
import { AddBankAccountDialog } from './bank-account-editor'
import { BankAccountsTable } from './bank-accounts-table'

/**
 * Platform bank accounts (#929): where schools wire platform-fee transfers.
 * Behind the /platform super-admin layout guard; every write goes through
 * `app/actions/platform/bank-accounts.ts` (super-admin verified, audited).
 */
export default async function PlatformBankAccountsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations('platform.bankAccounts')

  let accounts: PlatformBankAccount[] | null = null
  try {
    accounts = await listAllBankAccounts(createAdminClient())
  } catch (err) {
    console.error('[platform-bank-accounts] page read failed:', err instanceof Error ? err.message : err)
  }
  // Rows exist but none is active: schools see no details. (No rows: the empty state says it.)
  const noneActive = accounts !== null && accounts.length > 0 && !accounts.some((a) => a.isActive)

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-bank-accounts-page">
      <PlatformPageHeader title={t('title')} description={t('description')} actions={<AddBankAccountDialog />} />

      {noneActive ? (
        <p
          className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
          role="status"
          data-testid="bank-accounts-no-active"
        >
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {t('noActiveWarning')}
        </p>
      ) : null}

      {!accounts ? (
        <PlatformPanel className="px-5 py-4 text-sm text-destructive" role="alert">
          {t('loadError')}
        </PlatformPanel>
      ) : accounts.length === 0 ? (
        <PlatformPanel>
          <PlatformEmptyState
            icon={IconBuildingBank}
            title={t('empty')}
            description={t('emptyDesc')}
            action={<AddBankAccountDialog />}
            data-testid="bank-accounts-empty"
          />
        </PlatformPanel>
      ) : (
        <BankAccountsTable accounts={accounts} locale={locale} />
      )}
    </main>
  )
}
