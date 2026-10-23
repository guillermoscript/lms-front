import { getTranslations } from 'next-intl/server'
import { formatDistanceToNow } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import { WidgetError } from './widget-error'

export interface ActivityEvent {
  id: string
  kind: 'enrolled' | 'paid' | 'joined'
  at: string
  name: string | null
  course?: string | null
  amount?: number
}

/** One merged, newest-first feed of enrollments, payments and new members. */
export async function ActivityFeed({
  locale,
  events,
  hadError,
}: {
  locale: string
  events: ActivityEvent[]
  hadError: boolean
}) {
  const t = await getTranslations('dashboard.admin.main.activity')
  const dateLocale = locale === 'es' ? es : enUS
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })

  const sentence = (e: ActivityEvent) => {
    const name = e.name || t('someone')
    if (e.kind === 'enrolled') return t('enrolled', { name, course: e.course || t('aCourse') })
    if (e.kind === 'paid') return t('paid', { name, amount: money.format(e.amount ?? 0) })
    return t('joined', { name })
  }

  return (
    <section aria-labelledby="activity-title" data-testid="admin-recent-activity" className="space-y-2">
      <h2 id="activity-title" className="text-sm font-semibold text-muted-foreground">
        {t('title')}
      </h2>
      {hadError && <WidgetError message={t('error')} />}
      {events.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 truncate">{sentence(e)}</span>
              <time dateTime={e.at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDistanceToNow(new Date(e.at), { addSuffix: true, locale: dateLocale })}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        !hadError && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('empty')}</p>
      )}
    </section>
  )
}
