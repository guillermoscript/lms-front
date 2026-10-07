import { getLocale, getTranslations } from 'next-intl/server'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PROVIDER_LABELS, isProviderId } from '@/lib/ai/provider-ids'
import type { AiAuditDTO } from '@/app/actions/admin/ai-settings'

/** Last few key/model changes. Names who acted only as "you" or "another admin": no key material, no emails. */
export async function AuditHistory({ rows }: { rows: AiAuditDTO[] }) {
  const t = await getTranslations('aiSettings.history')
  const locale = await getLocale()
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <Card data-testid="ai-history">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription className="sr-only">{t('title')}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.slice(0, 8).map((row, i) => {
              const provider = row.provider && isProviderId(row.provider) ? PROVIDER_LABELS[row.provider] : row.provider
              return (
                <li key={`${row.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{row.actorIsMe ? t('you') : t('team')}</span>{' '}
                    {t(`actions.${row.action}` as never)}
                    {provider ? ` · ${provider}` : ''}
                  </span>
                  <time dateTime={row.at} className="text-xs text-muted-foreground">
                    {fmt.format(new Date(row.at))}
                  </time>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
