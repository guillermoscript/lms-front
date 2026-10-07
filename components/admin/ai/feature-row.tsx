'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconLoader2 } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { setFeatureModel, testFeature, type AiFeatureDTO, type AiProviderDTO } from '@/app/actions/admin/ai-settings'
import type { ProviderId } from '@/lib/ai/provider-ids'

import { ModelPicker } from './model-picker'
import { asTranslator, failureText, featureKind, liveFeatureCheck, warningText } from './helpers'

const DEFAULT_VOICE = '__default__'

interface FeatureRowProps {
  feature: AiFeatureDTO
  providers: AiProviderDTO[]
}

/** One AI feature: its effective source, a model picker, save / reset / test. */
export function FeatureRow({ feature, providers }: FeatureRowProps) {
  const t = useTranslations('aiSettings')
  const tx = asTranslator(t)
  const kind = featureKind(feature.feature)

  const eligible = providers.filter(
    (p) => p.connected && p.status !== 'disabled' && feature.allowedProviders.includes(p.provider),
  )

  const initialVoice = typeof feature.mapping?.params.voice === 'string' ? feature.mapping.params.voice : ''
  const [provider, setProvider] = useState<ProviderId | null>(feature.mapping?.provider ?? null)
  const [model, setModel] = useState(feature.mapping?.model ?? '')
  const [voice, setVoice] = useState(initialVoice)
  const [warnings, setWarnings] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'save' | 'reset' | 'test' | null>(null)

  const selected = provider ? eligible.find((p) => p.provider === provider) : undefined
  const check = liveFeatureCheck(feature.feature, selected, model)
  const blockedText = check.blocked ? t(`blocked.${check.blocked}`) : null

  const dirty =
    (provider ?? null) !== (feature.mapping?.provider ?? null) ||
    model.trim() !== (feature.mapping?.model ?? '') ||
    voice !== initialVoice
  const canSave = !!provider && model.trim().length > 0 && dirty && !check.blocked

  const source = feature.mapping
    ? t('advanced.source.custom')
    : feature.inherits
      ? t('advanced.source.inherits', { feature: t(`features.${feature.inherits}.name`) })
      : t('advanced.source.default')

  const voices = selected?.voices ?? []

  function save(clear: boolean) {
    setBusy(clear ? 'reset' : 'save')
    startTransition(async () => {
      try {
        const res = await setFeatureModel(
          clear
            ? { feature: feature.feature, provider: null, model: null }
            : {
                feature: feature.feature,
                provider,
                model: model.trim(),
                ...(voice ? { params: { voice } } : {}),
              },
        )
        if (res.ok) {
          setWarnings(res.warnings.map((w) => warningText(tx, w)))
          if (clear) {
            setProvider(null)
            setModel('')
            setVoice('')
            toast.success(t('advanced.resetDone'))
          } else toast.success(t('advanced.saved'))
        } else {
          toast.error(failureText(tx, res))
        }
      } catch {
        toast.error(t('errors.save_failed'))
      } finally {
        setBusy(null)
      }
    })
  }

  function test() {
    setBusy('test')
    startTransition(async () => {
      try {
        const res = await testFeature(feature.feature)
        if (res.ok) {
          toast.success(
            `${t('advanced.testOk', {
              provider: providers.find((p) => p.provider === res.providerId)?.label ?? res.providerId,
              model: res.modelId,
              ms: res.latencyMs,
            })} - ${t(`advanced.probe.${res.probe}`)}`,
          )
        } else {
          toast.error(failureText(tx, res))
        }
      } catch {
        toast.error(t('errors.save_failed'))
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <div className="space-y-3 py-4" data-testid={`ai-feature-${feature.feature}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h4 className="text-sm font-medium">{t(`features.${feature.feature}.name`)}</h4>
          <p className="text-xs text-muted-foreground">{t(`features.${feature.feature}.description`)}</p>
        </div>
        <Badge variant={feature.mapping ? 'default' : 'secondary'}>{source}</Badge>
      </div>

      {eligible.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('advanced.noProviders')}</p>
      ) : (
        <>
          <ModelPicker
            providers={eligible}
            kind={kind}
            provider={provider}
            model={model}
            onChange={(next) => {
              setProvider(next.provider)
              setModel(next.model)
              setVoice('')
              setWarnings([])
            }}
            allowEmpty
            placeholder={t('advanced.providerPlaceholder')}
            disabled={pending}
            missing={check.missing}
            blockedText={blockedText}
            compact
          />

          {kind === 'realtime' && provider && voices.length > 0 && (
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor={`voice-${feature.feature}`}>{t('advanced.voice')}</Label>
              <Select
                items={{ [DEFAULT_VOICE]: t('advanced.voiceDefault'), ...Object.fromEntries(voices.map((v) => [v, v])) }}
                value={voice || DEFAULT_VOICE}
                onValueChange={(v) => setVoice(!v || v === DEFAULT_VOICE ? '' : v)}
                disabled={pending}
              >
                <SelectTrigger id={`voice-${feature.feature}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value={DEFAULT_VOICE}>{t('advanced.voiceDefault')}</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-warning" aria-live="polite">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {feature.longRunning && <p className="text-xs text-muted-foreground">{t('advanced.longRunning')}</p>}
      {feature.feature === 'speech_stt' && provider && provider !== 'assemblyai' && (
        <p className="text-xs text-warning">{t('advanced.sttWordsHint')}</p>
      )}

      {eligible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => save(false)} disabled={!canSave || pending}>
            {busy === 'save' && <IconLoader2 className="animate-spin" aria-hidden />}
            {busy === 'save' ? t('advanced.saving') : t('advanced.save')}
          </Button>
          {feature.mapping && (
            <Button size="sm" variant="ghost" onClick={() => save(true)} disabled={pending}>
              {t('advanced.reset')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={test} disabled={pending || dirty}>
            {busy === 'test' && <IconLoader2 className="animate-spin" aria-hidden />}
            {busy === 'test' ? t('advanced.testing') : t('advanced.test')}
          </Button>
        </div>
      )}
    </div>
  )
}
