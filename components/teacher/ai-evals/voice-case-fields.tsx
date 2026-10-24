'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { VoiceExpected } from './scenario-types'

export type TriKey = 'yes' | 'no' | 'either'

export const triKey = (v: boolean | null | undefined): TriKey => (v === true ? 'yes' : v === false ? 'no' : 'either')
export const triValue = (k: TriKey): boolean | null => (k === 'yes' ? true : k === 'no' ? false : null)

/** Three-way segmented control (yes / no / either) with caller-supplied labels. */
export function TriToggle({
  value,
  onChange,
  labels,
  label,
  disabled,
}: {
  value: TriKey
  onChange: (next: TriKey) => void
  labels: Record<TriKey, string>
  label: string
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
      {(['yes', 'no', 'either'] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={value === option}
          onClick={() => value !== option && onChange(option)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50',
            value === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

export interface VoiceExpectedState {
  finished: TriKey
  passed: TriKey
  scoreMin: string
  scoreMax: string
}

export function toVoiceExpectedState(e: VoiceExpected | undefined): VoiceExpectedState {
  return {
    finished: triKey(e?.finished),
    passed: triKey(e?.passed),
    scoreMin: e?.score_min != null ? String(e.score_min) : '',
    scoreMax: e?.score_max != null ? String(e.score_max) : '',
  }
}

function parseScore(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const n = Math.round(Number(raw))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined
}

export function fromVoiceExpectedState(s: VoiceExpectedState): VoiceExpected {
  const out: VoiceExpected = { finished: triValue(s.finished), passed: triValue(s.passed) }
  const min = parseScore(s.scoreMin)
  const max = parseScore(s.scoreMax)
  if (min !== undefined) out.score_min = min
  if (max !== undefined) out.score_max = max
  return out
}

/** The min must not exceed the max (the server rejects it too). */
export function voiceBandInvalid(s: VoiceExpectedState): boolean {
  const min = parseScore(s.scoreMin)
  const max = parseScore(s.scoreMax)
  return min !== undefined && max !== undefined && min > max
}

/** Expected finish / pass / score band for a voice test. */
export function VoiceExpectedFields({
  idPrefix,
  state,
  onChange,
  disabled,
}: {
  idPrefix: string
  state: VoiceExpectedState
  onChange: (next: VoiceExpectedState) => void
  disabled?: boolean
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.voice.expected')
  const invalid = voiceBandInvalid(state)
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t('finished')}</Label>
        <div>
          <TriToggle
            value={state.finished}
            disabled={disabled}
            label={t('finished')}
            labels={{ yes: t('finishedYes'), no: t('finishedNo'), either: t('either') }}
            onChange={(finished) => onChange({ ...state, finished })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('passed')}</Label>
        <div>
          <TriToggle
            value={state.passed}
            disabled={disabled}
            label={t('passed')}
            labels={{ yes: t('passedYes'), no: t('passedNo'), either: t('either') }}
            onChange={(passed) => onChange({ ...state, passed })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-min`}>{t('scoreMin')}</Label>
          <Input
            id={`${idPrefix}-min`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={state.scoreMin}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(e) => onChange({ ...state, scoreMin: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-max`}>{t('scoreMax')}</Label>
          <Input
            id={`${idPrefix}-max`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={state.scoreMax}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(e) => onChange({ ...state, scoreMax: e.target.value })}
          />
        </div>
        <p className={cn('col-span-2 text-xs', invalid ? 'text-destructive' : 'text-muted-foreground')} role={invalid ? 'alert' : undefined}>
          {invalid ? t('bandInvalid') : t('bandHint')}
        </p>
      </div>
    </div>
  )
}
