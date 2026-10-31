import type { ReactNode } from 'react'

export interface RetoStat { label: string; value: ReactNode }

/** A reto summary card: title, subtitle, a row of stats, then free content (leaderboard, links…). */
export function RetoCard({ title, subtitle, stats, children, testId = 'reto-card' }: {
  title: ReactNode; subtitle?: ReactNode; stats: RetoStat[]; children?: ReactNode; testId?: string
}) {
  return (
    <article data-testid={testId} className="space-y-3 rounded-lg border bg-card p-4">
      <header>
        <h3 className="font-medium">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </article>
  )
}
