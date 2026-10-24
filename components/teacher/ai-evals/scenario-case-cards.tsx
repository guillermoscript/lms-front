'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconMicrophone, IconPencil, IconRobot } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DeleteButton, ExpectedBadge, ExpectedToggle, expectedKey, expectedValue, type ExpectedKey } from './case-cards'
import {
  fromVoiceExpectedState,
  toVoiceExpectedState,
  triKey,
  voiceBandInvalid,
  VoiceExpectedFields,
  type VoiceExpectedState,
} from './voice-case-fields'
import { SCENARIO_LIMITS, type ScenarioCaseRow, type ScenarioSurface, type VoiceCaseRow } from './scenario-types'

function SourceBadges({ item }: { item: ScenarioCaseRow }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.cases')
  const unverified = item.source === 'generated' && !item.teacher_edited
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant="outline">{t(item.source === 'teacher' ? 'sourceTeacher' : 'sourceGenerated')}</Badge>
      {unverified && (
        <Badge variant="outline" className="border-warning/40 text-warning">
          {t('unverified')}
        </Badge>
      )}
      {item.teacher_edited && <Badge variant="secondary">{t('editedByYou')}</Badge>}
    </div>
  )
}

export function ScenarioCaseCard({
  surface,
  item,
  busy,
  onEdit,
  onDelete,
}: {
  surface: ScenarioSurface
  item: ScenarioCaseRow
  busy: boolean
  onEdit: (item: ScenarioCaseRow) => void
  onDelete: (item: ScenarioCaseRow) => void
}) {
  const tc = useTranslations('dashboard.teacher.aiEvals.cases')
  const Icon = surface === 'voice' ? IconMicrophone : IconRobot
  return (
    <li className="rounded-lg border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm font-medium">{item.name}</p>
          </div>
          <SourceBadges item={item} />
          <p className="text-xs leading-relaxed text-muted-foreground">{item.input.persona}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={tc('editAria', { name: item.name })}
            disabled={busy}
            onClick={() => onEdit(item)}
          >
            <IconPencil aria-hidden="true" className="h-4 w-4" />
          </Button>
          <DeleteButton name={item.name} disabled={busy} onConfirm={() => onDelete(item)} />
        </div>
      </div>
      {item.importance_note && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{tc('whyItMatters')}: </span>
          {item.importance_note}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{tc('expectedLabel')}:</span>
        {item.kind === 'coach_scenario' ? (
          <ExpectedBadge value={expectedKey(item.expected?.completed)} />
        ) : (
          <VoiceExpectedSummary expected={item.expected} />
        )}
      </div>
    </li>
  )
}

function VoiceExpectedSummary({ expected }: { expected: VoiceCaseRow['expected'] }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.voice.expected')
  const parts: string[] = []
  const fin = triKey(expected?.finished)
  if (fin !== 'either') parts.push(t(fin === 'yes' ? 'summaryFinished' : 'summaryNotFinished'))
  const pas = triKey(expected?.passed)
  if (pas !== 'either') parts.push(t(pas === 'yes' ? 'summaryPass' : 'summaryFail'))
  if (expected?.score_min != null || expected?.score_max != null) {
    parts.push(t('summaryBand', { min: expected.score_min ?? 0, max: expected.score_max ?? 100 }))
  }
  return <Badge variant="outline">{parts.length ? parts.join(' · ') : t('either')}</Badge>
}

export interface ScenarioCasePatch {
  name: string
  importance_note: string | null
  expected: Record<string, unknown>
  must_keep: string[]
  input: Record<string, unknown>
}

const lines = (raw: string) => raw.split('\n').map((l) => l.trim()).filter(Boolean)

/** Create (item = null) or edit a coach/voice case. */
export function ScenarioCaseDialog({
  surface,
  item,
  onClose,
  onSave,
  saving,
  error,
}: {
  surface: ScenarioSurface
  item: ScenarioCaseRow | null
  onClose: () => void
  onSave: (patch: ScenarioCasePatch) => void
  saving: boolean
  error: string | null
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.dialog')
  const ts = useTranslations(`dashboard.teacher.aiEvals.scenarios.${surface}`)
  const maxScript = surface === 'voice' ? SCENARIO_LIMITS.voiceScript : SCENARIO_LIMITS.coachScript
  const input = item?.input
  const [name, setName] = useState(item?.name ?? '')
  const [persona, setPersona] = useState(input?.persona ?? '')
  const [goal, setGoal] = useState(input?.goal ?? '')
  const [script, setScript] = useState((input?.script ?? []).join('\n'))
  const [maxTurns, setMaxTurns] = useState(String(input?.max_turns ?? SCENARIO_LIMITS.defaultMaxTurns))
  const [simulateAfter, setSimulateAfter] = useState(
    item?.kind === 'voice_scenario' ? item.input.simulate_after_script !== false : true
  )
  const [coachExpected, setCoachExpected] = useState<ExpectedKey>(
    item?.kind === 'coach_scenario' ? expectedKey(item.expected?.completed) : 'not_complete'
  )
  const [voiceExpected, setVoiceExpected] = useState<VoiceExpectedState>(
    toVoiceExpectedState(item?.kind === 'voice_scenario' ? item.expected : undefined)
  )
  const [mustKeep, setMustKeep] = useState((item?.must_keep ?? []).join('\n'))
  const [note, setNote] = useState(item?.importance_note ?? '')

  const turns = Math.min(SCENARIO_LIMITS.maxTurns, Math.max(1, Math.round(Number(maxTurns)) || SCENARIO_LIMITS.defaultMaxTurns))
  const scriptLines = lines(script)
  const tooLong = scriptLines.length > maxScript
  const bandBad = surface === 'voice' && voiceBandInvalid(voiceExpected)

  const submit = () => {
    const base = { persona: persona.trim(), goal: goal.trim(), script: scriptLines, max_turns: turns }
    onSave({
      name: name.trim(),
      importance_note: note.trim() || null,
      must_keep: lines(mustKeep),
      expected: surface === 'coach' ? { completed: expectedValue(coachExpected) } : { ...fromVoiceExpectedState(voiceExpected) },
      input: surface === 'voice' ? { ...base, simulate_after_script: simulateAfter } : base,
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? ts('dialog.editTitle') : ts('dialog.addTitle')}</DialogTitle>
          <DialogDescription>{item ? t('editDescription') : ts('dialog.addDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="sc-name">{t('name')}</Label>
            <Input id="sc-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-persona">{t('persona')}</Label>
            <Textarea id="sc-persona" rows={3} value={persona} maxLength={1000} onChange={(e) => setPersona(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-goal">{t('goal')}</Label>
            <Textarea id="sc-goal" rows={2} value={goal} maxLength={1000} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-script">{t('script')}</Label>
            <Textarea id="sc-script" rows={4} value={script} onChange={(e) => setScript(e.target.value)} aria-invalid={tooLong} />
            <p className={tooLong ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'} role={tooLong ? 'alert' : undefined}>
              {t(tooLong ? 'scriptTooLong' : 'scriptHint', { max: maxScript })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-turns">{t('maxTurns')}</Label>
            <Input
              id="sc-turns"
              type="number"
              inputMode="numeric"
              min={1}
              max={SCENARIO_LIMITS.maxTurns}
              className="w-24"
              value={maxTurns}
              onChange={(e) => setMaxTurns(e.target.value)}
            />
          </div>
          {surface === 'voice' && (
            <label className="flex items-start gap-2.5">
              <Switch checked={simulateAfter} onCheckedChange={setSimulateAfter} />
              <span>
                <span className="block">{t('simulateAfterScript')}</span>
                <span className="block text-xs text-muted-foreground">{t('simulateAfterScriptHint')}</span>
              </span>
            </label>
          )}
          {surface === 'coach' ? (
            <div className="space-y-1.5">
              <Label>{ts('dialog.expected')}</Label>
              <div>
                <ExpectedToggle value={coachExpected} onChange={setCoachExpected} label={ts('dialog.expected')} />
              </div>
              <p className="text-xs text-muted-foreground">{ts('dialog.expectedHint')}</p>
            </div>
          ) : (
            <VoiceExpectedFields idPrefix="sc-v" state={voiceExpected} onChange={setVoiceExpected} disabled={saving} />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sc-keep">{t('mustKeep')}</Label>
            <Textarea id="sc-keep" rows={3} value={mustKeep} onChange={(e) => setMustKeep(e.target.value)} />
            <p className="text-xs text-muted-foreground">{ts('dialog.mustKeepHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-note">{t('note')}</Label>
            <Textarea id="sc-note" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !name.trim() || !persona.trim() || tooLong || bandBad}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
