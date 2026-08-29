'use client'

import { useId, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle, IconCheck, IconLock } from '@tabler/icons-react'
import {
  providerFacts,
  providerStatus,
  type ConfigurableProvider,
  type ProviderStatus,
} from '@/lib/payments/provider-presentation'

interface PaymentProviderRowProps {
  provider: ConfigurableProvider
  /** Already-translated provider name — product names mostly pass through. */
  name: string
  /** Already-translated one-liner: what the student actually pays with. */
  description: string
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  /**
   * Can this rail take money right now? Drives the status pill, and — only when
   * the rail is also ON — the one warning state on the page.
   */
  configured: boolean
  /**
   * Offline payment cannot be switched off: `getEnabledProviders()` seeds every
   * tenant with it as the fallback. The row says so instead of rendering a
   * switch that would lie about being interactive.
   */
  locked?: boolean
  /** Setup affordance (Connect link, "Add wallet" button) rendered in-row. */
  action?: ReactNode
  /** Sentence shown when the rail is on but unusable — what to do about it. */
  setupHint?: string
  /** Config that is plain inputs (no nested <form>) and can expand in place. */
  children?: ReactNode
}

const STATUS_STYLES: Record<ProviderStatus, string> = {
  // Green is conventional for "money can move" and, unlike the old amber card,
  // never collides with a tenant's brand hue the way a warning tint did.
  ready: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  // The ONLY loud state on the page, and it is reachable only from
  // enabled && !configured — the state that silently loses sales.
  blocked: 'border-transparent bg-destructive/10 text-destructive',
  off: 'border-border text-muted-foreground',
  notConfigured: 'border-border text-muted-foreground',
}

const FACT_TONE: Record<string, string> = {
  good: 'text-foreground/70',
  neutral: 'text-muted-foreground',
  caveat: 'text-muted-foreground',
}

export function PaymentProviderRow({
  provider,
  name,
  description,
  enabled,
  onEnabledChange,
  configured,
  locked = false,
  action,
  setupHint,
  children,
}: PaymentProviderRowProps) {
  const t = useTranslations('dashboard.admin.settings.form.payment')
  const descriptionId = useId()
  const factsId = useId()

  // A locked rail is always on and always usable; it must never render as a
  // provider the admin forgot to configure.
  const status: ProviderStatus = locked ? 'ready' : providerStatus(enabled, configured)
  const facts = providerFacts(provider)
  const showSetupHint = Boolean(setupHint) && enabled && !configured && !locked

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3.5 transition-colors',
        enabled || locked ? 'bg-card' : 'bg-muted/20',
        status === 'blocked' && 'border-destructive/30'
      )}
      data-testid={`payment-provider-row-${provider}`}
      data-provider-status={status}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{name}</span>
            <Badge
              variant="outline"
              className={cn('gap-1', STATUS_STYLES[status])}
              data-testid={`payment-provider-status-${provider}`}
            >
              {status === 'ready' && <IconCheck aria-hidden />}
              {status === 'blocked' && <IconAlertTriangle aria-hidden />}
              {locked && <IconLock aria-hidden />}
              {locked ? t('alwaysAvailable') : t(`status.${status}`)}
            </Badge>
          </div>

          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>

          {/* The four facts an admin actually needs, derived from
              PROVIDER_CAPABILITIES so this can never drift from checkout. */}
          <ul id={factsId} className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            {facts.map((fact) => (
              <li
                key={fact.id}
                className={cn(
                  'text-xs before:mr-1.5 before:text-muted-foreground/50 before:content-["·"] first:before:hidden first:before:mr-0',
                  FACT_TONE[fact.tone]
                )}
              >
                {t(`facts.${fact.id}`)}
              </li>
            ))}
          </ul>

          {showSetupHint && (
            <p className="pt-1 text-xs font-medium text-destructive">{setupHint}</p>
          )}

          {action && <div className="pt-2">{action}</div>}
        </div>

        {locked ? (
          <span className="sr-only">{t('alwaysAvailableHint')}</span>
        ) : (
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-label={name}
            aria-describedby={`${descriptionId} ${factsId}`}
            data-testid={`payment-provider-switch-${provider}`}
          />
        )}
      </div>

      {children && <div className="mt-3 border-t pt-3">{children}</div>}
    </div>
  )
}

export default PaymentProviderRow
