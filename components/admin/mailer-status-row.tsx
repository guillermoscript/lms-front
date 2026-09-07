import { getTranslations } from 'next-intl/server'
import { IconMailCheck, IconMailOff } from '@tabler/icons-react'
import type { MailerStatus } from '@/lib/email/status'

/**
 * Read-only "can this platform send email?" line at the top of Settings →
 * Email (#676). The SMTP form below it is tenant config nothing reads yet;
 * this row is what actually decides whether invitations, certificates and
 * course notices go out, so an admin can see why a recipient got nothing.
 */
export async function MailerStatusRow({ status }: { status: MailerStatus }) {
  const t = await getTranslations('dashboard.admin.settings.mailer')
  const Icon = status.configured ? IconMailCheck : IconMailOff

  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-4"
      data-testid="mailer-status"
      data-configured={status.configured ? 'true' : 'false'}
      role="status"
    >
      <Icon
        className={
          status.configured
            ? 'mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400'
            : 'mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400'
        }
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('label')}</p>
        <p className="text-sm text-muted-foreground" data-testid="mailer-status-text">
          {status.configured
            ? t('configured', { from: status.from ?? '', domain: status.domain ?? '' })
            : t('notConfigured')}
        </p>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </div>
    </div>
  )
}
