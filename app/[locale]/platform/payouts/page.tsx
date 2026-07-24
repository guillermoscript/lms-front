import { getPayoutsOwed } from '@/app/actions/platform/payouts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkPayoutPaidDialog } from '@/components/platform/mark-payout-paid-dialog'
import {
  IconCoin,
  IconReportMoney,
  IconWalletOff,
} from '@tabler/icons-react'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

const PROVIDER_LABEL: Record<string, string> = {
  paypal: 'PayPal',
  binance: 'Binance Pay',
  lemonsqueezy: 'Lemon Squeezy',
}

export default async function PlatformPayoutsPage() {
  const owed = await getPayoutsOwed()

  const totalOwed = owed.reduce((sum, t) => sum + t.netOwed, 0)
  const totalCollected = owed.reduce((sum, t) => sum + t.grossCollected, 0)
  const totalPaidOut = owed.reduce((sum, t) => sum + t.alreadyPaid, 0)
  const schoolsOwed = owed.filter((t) => t.netOwed > 0).length

  const metricCards = [
    {
      title: 'Currently Owed',
      value: usd(totalOwed),
      sub: `${schoolsOwed} school${schoolsOwed === 1 ? '' : 's'} awaiting payout`,
      icon: IconWalletOff,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Collected (single-account providers)',
      value: usd(totalCollected),
      sub: 'PayPal, Binance Pay, Lemon Squeezy — 100% lands in your account',
      icon: IconCoin,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Paid Out (all time)',
      value: usd(totalPaidOut),
      sub: 'Manually recorded payouts to schools',
      icon: IconReportMoney,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-payouts">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          PayPal, Binance Pay, and Lemon Squeezy don&apos;t split automatically — 100% of every sale
          lands in your account. This is what you owe each school back, based on their revenue split.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3" data-testid="payouts-metrics">
        {metricCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums" data-testid="metric-value">
                    {card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{card.sub}</p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.bg}`}>
                  <card.icon className={`h-[18px] w-[18px] ${card.iconColor}`} strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="payouts-by-tenant">
        <CardHeader>
          <CardTitle>By school</CardTitle>
        </CardHeader>
        <CardContent>
          {owed.length === 0 ? (
            <p className="text-muted-foreground text-sm">No schools yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-medium">School</th>
                    <th className="pb-2 font-medium">Providers</th>
                    <th className="pb-2 text-right font-medium">Collected</th>
                    <th className="pb-2 text-right font-medium">School %</th>
                    <th className="pb-2 text-right font-medium">Paid so far</th>
                    <th className="pb-2 text-right font-medium">Owed</th>
                    <th className="pb-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {owed.map((t) => (
                    <tr key={t.tenantId} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{t.tenantName}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {Object.keys(t.byProvider).length === 0
                          ? '—'
                          : Object.keys(t.byProvider).map((p) => PROVIDER_LABEL[p] ?? p).join(', ')}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{usd(t.grossCollected)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {t.schoolPercentage}%
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {usd(t.alreadyPaid)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                        {usd(t.netOwed)}
                      </td>
                      <td className="py-2.5 text-right">
                        <MarkPayoutPaidDialog
                          tenantId={t.tenantId}
                          tenantName={t.tenantName}
                          netOwed={t.netOwed}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-[11px] text-muted-foreground/70">
        Stripe and Solana sales already split automatically and never appear here. Binance Pay
        (personal account) and manual/offline sales settle straight to the school and also never
        appear here — only PayPal, Binance Pay (merchant), and Lemon Squeezy do, since those settle
        100% into your account today.
      </p>
    </main>
  )
}
