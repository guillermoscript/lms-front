'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconLoader2 } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { setAiDefault, type AiProviderDTO } from '@/app/actions/admin/ai-settings'
import type { ProviderId } from '@/lib/ai/provider-ids'

import { ModelPicker } from './model-picker'
import { asTranslator, failureText, warningText } from './helpers'

interface DefaultModelCardProps {
  providers: AiProviderDTO[]
  current: { provider: ProviderId; model: string } | null
}

/** The school-wide default (resolution step 4): every unmapped language feature ends up here. */
export function DefaultModelCard({ providers, current }: DefaultModelCardProps) {
  const t = useTranslations('aiSettings')
  const tx = asTranslator(t)
  const eligible = providers.filter(
    (p) => p.connected && p.status !== 'disabled' && p.kinds.includes('language'),
  )
  const [provider, setProvider] = useState<ProviderId | null>(current?.provider ?? null)
  const [model, setModel] = useState(current?.model ?? '')
  const [warnings, setWarnings] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  const dirty = (provider ?? null) !== (current?.provider ?? null) || model.trim() !== (current?.model ?? '')
  const canSave = !!provider && model.trim().length > 0 && dirty

  function save(clear: boolean) {
    startTransition(async () => {
      try {
        const res = await setAiDefault(
          clear ? { provider: null, model: null } : { provider, model: model.trim() },
        )
        if (res.ok) {
          setWarnings(res.warnings.map((w) => warningText(tx, w)))
          if (clear) {
            setProvider(null)
            setModel('')
            toast.success(t('default.cleared'))
          } else toast.success(t('default.saved'))
        } else {
          toast.error(failureText(tx, res))
        }
      } catch {
        toast.error(t('errors.save_failed'))
      }
    })
  }

  return (
    <Card data-testid="ai-default-model">
      <CardHeader>
        <CardTitle>{t('default.title')}</CardTitle>
        <CardDescription>{t('default.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('default.noProviders')}</p>
        ) : (
          <>
            <ModelPicker
              providers={eligible}
              kind="language"
              provider={provider}
              model={model}
              onChange={(next) => {
                setProvider(next.provider)
                setModel(next.model)
                setWarnings([])
              }}
              disabled={pending}
            />
            {warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-warning" aria-live="polite">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => save(false)} disabled={!canSave || pending} data-testid="ai-default-save">
                {pending && <IconLoader2 className="animate-spin" aria-hidden />}
                {pending ? t('default.saving') : t('default.save')}
              </Button>
              {current && (
                <Button variant="ghost" onClick={() => save(true)} disabled={pending}>
                  {t('default.clear')}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {current
                  ? t('default.current', {
                      provider: providers.find((p) => p.provider === current.provider)?.label ?? current.provider,
                      model: current.model,
                    })
                  : t('default.none')}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
