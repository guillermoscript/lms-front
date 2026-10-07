'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconCheck, IconEye, IconEyeOff, IconKey, IconLoader2, IconRefresh, IconAlertTriangle } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import {
  refreshProviderModels,
  removeAiCredential,
  saveAiCredential,
  testAiCredential,
  type AiProviderDTO,
} from '@/app/actions/admin/ai-settings'

import { asTranslator, failureText, formatDate } from './helpers'

/** The card only needs `modelCount`; the model list itself is sent to the pickers, not to every card. */
export type ProviderCardData = Omit<AiProviderDTO, 'models'>

interface ProviderCardProps {
  provider: ProviderCardData
}

/** One provider: connect / replace / remove / test / refresh models. The key itself never comes back, only `last4`. */
export function ProviderCard({ provider }: ProviderCardProps) {
  const t = useTranslations('aiSettings')
  const tx = asTranslator(t)
  const locale = useLocale()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'test' | 'refresh' | 'remove' | null>(null)

  const { connected, status } = provider
  const checkedOn = formatDate(provider.validatedAt, locale)
  const usedOn = formatDate(provider.lastUsedAt, locale)
  const statusKey = !connected ? 'notConnected' : (status ?? 'active')

  function run(kind: 'test' | 'refresh' | 'remove') {
    setBusy(kind)
    startTransition(async () => {
      try {
        if (kind === 'test') {
          const res = await testAiCredential(provider.provider)
          if (res.ok) toast.success(t('providers.toast.testOk', { provider: provider.label }))
          else toast.error(failureText(tx, res))
        } else if (kind === 'refresh') {
          const res = await refreshProviderModels(provider.provider)
          if (res.ok) toast.success(t('providers.toast.refreshed', { provider: provider.label, count: res.models.length }))
          else toast.error(failureText(tx, res))
        } else {
          const res = await removeAiCredential(provider.provider)
          if (res.ok) {
            const count = res.cleared.features.length + res.cleared.courses + (res.cleared.default ? 1 : 0)
            toast.success(
              count > 0
                ? t('providers.toast.removedCleared', { provider: provider.label, count })
                : t('providers.toast.removed', { provider: provider.label }),
            )
          } else toast.error(failureText(tx, res))
        }
      } catch {
        toast.error(t('errors.save_failed'))
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <Card data-testid={`ai-provider-${provider.provider}`} className={status === 'invalid' ? 'border-destructive/40' : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-sm font-semibold">{provider.label}</h3>
            <p className="text-xs text-muted-foreground">
              {provider.kinds.map((k) => t(`providers.kinds.${k}`)).join(' · ')}
            </p>
          </div>
          <Badge variant={status === 'invalid' ? 'destructive' : connected && status === 'active' ? 'default' : 'secondary'}>
            {status === 'active' && <IconCheck aria-hidden />}
            {t(`providers.status.${statusKey}`)}
          </Badge>
        </div>

        {connected ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-mono text-foreground">
              <IconKey className="size-3.5 text-muted-foreground" aria-hidden />
              <span aria-label={t('providers.keyEnding', { last4: provider.last4 ?? '' })}>
                {'••••••'}
                {provider.last4}
              </span>
            </p>
            {status === 'invalid' && (
              <p className="flex items-start gap-1.5 text-destructive">
                <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t('providers.invalidHint')}
              </p>
            )}
            <p>
              {[
                checkedOn ? t('providers.checkedOn', { date: checkedOn }) : null,
                usedOn ? t('providers.usedOn', { date: usedOn }) : t('providers.neverUsed'),
                provider.modelCount !== null ? t('providers.modelCount', { count: provider.modelCount }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} disabled={pending}>
                {t('providers.replace')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => run('test')} disabled={pending}>
                {busy === 'test' && <IconLoader2 className="animate-spin" aria-hidden />}
                {t('providers.test')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => run('refresh')} disabled={pending}>
                {busy === 'refresh' ? <IconLoader2 className="animate-spin" aria-hidden /> : <IconRefresh aria-hidden />}
                {t('providers.refresh')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} disabled={pending} className="text-destructive hover:text-destructive">
                {t('providers.remove')}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              {t('providers.add')}
            </Button>
          )}
        </div>
      </CardContent>

      <KeyDialog provider={provider} open={dialogOpen} onOpenChange={setDialogOpen} replacing={connected} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('providers.removeConfirm.title', { provider: provider.label })}
        description={t('providers.removeConfirm.description', { provider: provider.label })}
        confirmText={t('providers.removeConfirm.confirm')}
        cancelText={t('providers.removeConfirm.cancel')}
        variant="destructive"
        onConfirm={() => run('remove')}
      />
    </Card>
  )
}

function KeyDialog({
  provider,
  open,
  onOpenChange,
  replacing,
}: {
  provider: ProviderCardData
  open: boolean
  onOpenChange: (open: boolean) => void
  replacing: boolean
}) {
  const t = useTranslations('aiSettings')
  const tx = asTranslator(t)
  const [apiKey, setApiKey] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputId = `ai-key-${provider.provider}`

  function close(next: boolean) {
    // Drop the key from component state as soon as the dialog goes away.
    if (!next) {
      setApiKey('')
      setReveal(false)
      setError(null)
    }
    onOpenChange(next)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await saveAiCredential({ provider: provider.provider, apiKey: apiKey.trim() })
      if (res.ok) {
        toast.success(t('providers.toast.saved', { provider: provider.label }))
        close(false)
      } else {
        setError(failureText(tx, res))
      }
    } catch {
      setError(t('errors.save_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" autoComplete="off">
          <DialogHeader>
            <DialogTitle>
              {replacing
                ? t('providers.dialog.replaceTitle', { provider: provider.label })
                : t('providers.dialog.addTitle', { provider: provider.label })}
            </DialogTitle>
            <DialogDescription>{t('providers.dialog.description', { provider: provider.label })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={inputId}>{t('providers.dialog.keyLabel')}</Label>
            <div className="relative">
              <Input
                id={inputId}
                name="ai-provider-key"
                type={reveal ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('providers.dialog.keyPlaceholder')}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                minLength={8}
                maxLength={512}
                className="pr-8 font-mono"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                data-testid="ai-key-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-0.5 -translate-y-1/2"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? t('providers.dialog.hide') : t('providers.dialog.show')}
                aria-pressed={reveal}
              >
                {reveal ? <IconEyeOff aria-hidden /> : <IconEye aria-hidden />}
              </Button>
            </div>
            {error && (
              <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={submitting}>
              {t('providers.dialog.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || apiKey.trim().length < 8} data-testid="ai-key-submit">
              {submitting && <IconLoader2 className="animate-spin" aria-hidden />}
              {submitting ? t('providers.dialog.submitting') : t('providers.dialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
