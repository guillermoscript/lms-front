import { getTranslations } from 'next-intl/server'
import type { PlatformBankAccount } from '@/lib/billing/platform-bank-accounts'
import { platformAccountSummary } from '@/lib/billing/platform-bank-account-summary'
import { PlatformPanel, TD, TH } from '@/components/platform/section'
import { StatusDot } from '@/components/platform/badges'
import { BankAccountActiveButton, EditBankAccountDialog } from './bank-account-editor'

/** Server-rendered account list; only the row actions are client components. */
export async function BankAccountsTable({ accounts, locale }: { accounts: PlatformBankAccount[]; locale: string }) {
  const t = await getTranslations('platform.bankAccounts')
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso))
  return (
    <PlatformPanel>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm" data-testid="bank-accounts-table">
          <thead className="border-b">
            <tr>
              <th className={TH}>{t('headers.account')}</th>
              <th className={TH}>{t('headers.currency')}</th>
              <th className={TH}>{t('headers.method')}</th>
              <th className={TH}>{t('headers.details')}</th>
              <th className={TH}>{t('headers.status')}</th>
              <th className={TH}>{t('headers.updated')}</th>
              <th className={TH}>
                <span className="sr-only">{t('edit')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {accounts.map((a) => (
              <tr key={a.id} data-testid="bank-account-row" data-currency={a.currency} data-kind={a.kind} data-active={a.isActive}>
                <td className={TD}>
                  <p className="font-medium">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.accountHolder ?? a.bankName ?? ''}</p>
                </td>
                <td className={`${TD} font-mono text-xs`}>{a.currency}</td>
                <td className={TD} data-testid="bank-account-kind-cell">{t(`kinds.${a.kind}.name`)}</td>
                <td className={`${TD} max-w-[18rem] truncate font-mono text-xs`}>{platformAccountSummary(a)}</td>
                <td className={TD}>
                  <StatusDot tone={a.isActive ? 'ok' : 'muted'} label={a.isActive ? t('active') : t('inactive')} />
                </td>
                <td className={`${TD} whitespace-nowrap text-xs text-muted-foreground`}>{fmt(a.updatedAt)}</td>
                <td className={`${TD} text-right`}>
                  <div className="flex justify-end gap-2">
                    <EditBankAccountDialog account={a} />
                    <BankAccountActiveButton id={a.id} active={a.isActive} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PlatformPanel>
  )
}
