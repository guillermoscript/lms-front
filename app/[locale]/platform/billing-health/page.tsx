import { getAtRiskTenants } from '@/app/actions/platform/billing-health'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import {
  IconAlertTriangle,
  IconClockPause,
  IconCreditCardOff,
} from '@tabler/icons-react'

export default async function PlatformBillingHealthPage() {
  const atRisk = await getAtRiskTenants()

  const manualTransfer = atRisk.filter((t) => t.paymentMethod === 'manual_transfer')
  const stripeDunning = atRisk.filter((t) => t.paymentMethod !== 'manual_transfer')
  const urgent = manualTransfer.filter((t) => t.daysUntilDowngrade !== null && t.daysUntilDowngrade <= 3)

  const metricCards = [
    {
      title: 'Past-Due Schools',
      value: String(atRisk.length),
      sub: 'Total schools currently behind on payment',
      icon: IconAlertTriangle,
      bg: 'bg-red-50 dark:bg-red-950/40',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: 'Manual-Transfer Grace Running',
      value: String(manualTransfer.length),
      sub: urgent.length > 0 ? `${urgent.length} downgrading within 3 days` : 'None expiring imminently',
      icon: IconClockPause,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Stripe Dunning In Progress',
      value: String(stripeDunning.length),
      sub: 'Downgrade timing controlled by Stripe, not this app',
      icon: IconCreditCardOff,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-billing-health">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Billing Health</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schools currently past-due, with their grace-period countdown to automatic downgrade.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3" data-testid="billing-health-metrics">
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

      <Card data-testid="billing-health-by-tenant">
        <CardHeader>
          <CardTitle>At-risk schools</CardTitle>
        </CardHeader>
        <CardContent>
          {atRisk.length === 0 ? (
            <p className="text-muted-foreground text-sm">No schools currently past-due.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-medium">School</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Payment method</th>
                    <th className="pb-2 font-medium">Past due since</th>
                    <th className="pb-2 font-medium">Downgrades in</th>
                    <th className="pb-2 font-medium">Access cutoff</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map((t) => (
                    <tr key={t.tenantId} className="border-b last:border-0" data-testid="at-risk-row" data-tenant-id={t.tenantId}>
                      <td className="py-2.5 font-medium">{t.tenantName}</td>
                      <td className="py-2.5 capitalize text-muted-foreground">{t.plan || '—'}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {t.paymentMethod === 'manual_transfer' ? 'Manual transfer' : t.paymentMethod === 'stripe' ? 'Stripe' : '—'}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {t.pastDueSince ? format(new Date(t.pastDueSince), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="py-2.5">
                        {t.isEstimate ? (
                          <Badge variant="outline" className="text-[10px]">Stripe-managed</Badge>
                        ) : t.daysUntilDowngrade !== null ? (
                          <span
                            className={`font-medium tabular-nums ${
                              t.daysUntilDowngrade <= 3
                                ? 'text-red-600 dark:text-red-400'
                                : t.daysUntilDowngrade <= 7
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {t.daysUntilDowngrade <= 0 ? 'Overdue' : `${t.daysUntilDowngrade} day${t.daysUntilDowngrade === 1 ? '' : 's'}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {t.accessCutoffAt ? format(new Date(t.accessCutoffAt), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
