import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconArrowRight, IconCircleCheck } from '@tabler/icons-react'
import { WidgetError } from './widget-error'

export type AttentionKey =
  | 'paymentRequests'
  | 'examSubmissions'
  | 'pastDue'
  | 'failedPayments'
  | 'flags'
  | 'questions'

export interface AttentionItem {
  key: AttentionKey
  count: number
  href: string
  testId?: string
}

/**
 * Things only the owner can unblock. Rendered as rows (count, what, one verb)
 * only when something is waiting; otherwise a single quiet line.
 */
export async function NeedsAttention({
  items,
  hadError,
}: {
  items: AttentionItem[]
  hadError: boolean
}) {
  const t = await getTranslations('dashboard.admin.main.attention')
  const waiting = items.filter((i) => i.count > 0)

  return (
    <section aria-labelledby="needs-attention-title" data-testid="admin-needs-attention" className="space-y-2">
      {hadError && <WidgetError message={t('error')} />}
      {waiting.length === 0 ? (
        !hadError && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconCircleCheck aria-hidden className="size-4 text-success" />
            {t('clear')}
          </p>
        )
      ) : (
        <>
          <h2 id="needs-attention-title" className="text-sm font-semibold">
            {t('title')}
          </h2>
          <ul className="divide-y rounded-lg border">
            {waiting.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold tabular-nums" data-testid={item.testId}>
                      {item.count}
                    </span>
                    {' '}
                    {/* The ICU message leads with the count ("# …") so plural
                        agreement stays in the catalogue; the count is rendered
                        bold above, so strip it from the label. */}
                    <span>{t(item.key, { count: item.count }).replace(/^\d+\s*/, '')}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-text">
                    {t(`${item.key}Action`)}
                    <IconArrowRight aria-hidden className="size-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
