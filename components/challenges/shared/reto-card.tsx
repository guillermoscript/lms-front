import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export interface RetoStat { label: string; value: ReactNode }

/** A reto summary card: title, subtitle, a row of stats, then free content (leaderboard, links…). */
export function RetoCard({ title, subtitle, stats, children, testId = 'reto-card' }: {
  title: ReactNode; subtitle?: ReactNode; stats: RetoStat[]; children?: ReactNode; testId?: string
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="text-sm font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        {children}
      </CardContent>
    </Card>
  )
}
