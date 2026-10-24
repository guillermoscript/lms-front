'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { GradedExpected } from './types'

export type PassedChoice = 'auto' | 'pass' | 'fail'

export function passedChoice(passed: boolean | null | undefined): PassedChoice {
  return passed === true ? 'pass' : passed === false ? 'fail' : 'auto'
}

export function passedValue(choice: PassedChoice): boolean | null {
  return choice === 'pass' ? true : choice === 'fail' ? false : null
}

/** Clamp a free-typed number input into [min, max]; empty -> fallback. */
export function clampInt(raw: string, min: number, max: number, fallback: number): number {
  if (raw.trim() === '') return fallback
  const n = Math.round(Number(raw))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** Three-way segmented control: derive from score / must pass / must fail. */
export function PassedToggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: PassedChoice
  onChange: (next: PassedChoice) => void
  disabled?: boolean
  label: string
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.passed')
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap items-center rounded-lg border bg-muted/40 p-0.5">
      {(['auto', 'pass', 'fail'] as const).map((option) => (
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
          {t(option)}
        </button>
      ))}
    </div>
  )
}

export interface ExpectedFormState {
  score: string
  tolerance: string
  passed: PassedChoice
}

export function toExpectedState(expected: Pick<GradedExpected, 'score' | 'tolerance' | 'passed'>): ExpectedFormState {
  return { score: String(expected.score), tolerance: String(expected.tolerance), passed: passedChoice(expected.passed) }
}

export function fromExpectedState(state: ExpectedFormState, fallbackTolerance: number) {
  return {
    score: clampInt(state.score, 0, 100, 0),
    tolerance: clampInt(state.tolerance, 0, 50, fallbackTolerance),
    passed: passedValue(state.passed),
  }
}

/** Expected score + tolerance + pass/fail override: shared by the edit, add and save-golden dialogs. */
export function ExpectedFields({
  idPrefix,
  state,
  onChange,
  disabled,
}: {
  idPrefix: string
  state: ExpectedFormState
  onChange: (next: ExpectedFormState) => void
  disabled?: boolean
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.fields')
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-score`}>{t('score')}</Label>
          <Input
            id={`${idPrefix}-score`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={state.score}
            disabled={disabled}
            onChange={(e) => onChange({ ...state, score: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-tol`}>{t('tolerance')}</Label>
          <Input
            id={`${idPrefix}-tol`}
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            value={state.tolerance}
            disabled={disabled}
            onChange={(e) => onChange({ ...state, tolerance: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('toleranceHint')}</p>
      <div className="space-y-1.5">
        <Label>{t('passed')}</Label>
        <div>
          <PassedToggle value={state.passed} onChange={(passed) => onChange({ ...state, passed })} disabled={disabled} label={t('passed')} />
        </div>
        <p className="text-xs text-muted-foreground">{t('passedHint')}</p>
      </div>
    </div>
  )
}
