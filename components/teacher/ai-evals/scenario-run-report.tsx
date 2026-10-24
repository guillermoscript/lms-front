'use client'

import { Fragment, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconX,
} from '@tabler/icons-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { TranscriptMessage } from '@/lib/ai/evals/schema'
import {
  SURFACE_KIND,
  type CoachOutput,
  type ScenarioResultRow,
  type ScenarioSurface,
  type VoiceExpected,
  type VoiceOutput,
  type VoiceReason,
} from './scenario-types'
import { triKey } from './voice-case-fields'

type Light = 'green' | 'yellow' | 'red'
export type Verdict = 'ok' | 'error' | 'unexpected_completion' | 'no_completion' | 'criteria_failed' | VoiceReason | 'failed'

export function surfaceResults(results: ScenarioResultRow[], surface: ScenarioSurface): ScenarioResultRow[] {
  return results.filter((r) => r.case_kind === SURFACE_KIND[surface])
}

const coachOut = (r: ScenarioResultRow) => (r.output?.kind === 'coach' ? (r.output as CoachOutput) : null)
const voiceOut = (r: ScenarioResultRow) => (r.output?.kind === 'voice' ? (r.output as VoiceOutput) : null)
const coachExpectedCompleted = (r: ScenarioResultRow) => (r.expected as { completed?: boolean | null } | null | undefined)?.completed
const voiceExpected = (r: ScenarioResultRow) => (r.expected as VoiceExpected | null | undefined) ?? null

/** The coach marked the exercise complete although the case says it must not. */
export function isUnexpectedCompletion(r: ScenarioResultRow): boolean {
  if (r.error) return false
  const out = coachOut(r)
  if (out?.reasons?.includes('unexpected_completion')) return true
  return coachExpectedCompleted(r) === false && (out?.completed ?? r.completed) === true
}

export function resultVerdict(r: ScenarioResultRow, surface: ScenarioSurface): Verdict {
  if (r.error) return 'error'
  if (surface === 'coach') {
    if (isUnexpectedCompletion(r)) return 'unexpected_completion'
    const reasons = coachOut(r)?.reasons
    if (reasons?.includes('no_completion')) return 'no_completion'
    if (reasons?.includes('criteria_failed')) return 'criteria_failed'
  } else {
    const reasons = voiceOut(r)?.reasons ?? []
    for (const key of ['score_above_band', 'pass_mismatch', 'score_below_band', 'finish_mismatch', 'criteria_failed'] as const) {
      if (reasons.includes(key)) return key
    }
  }
  return r.passed ? 'ok' : 'failed'
}

const DESTRUCTIVE: Verdict[] = ['error', 'unexpected_completion', 'score_above_band', 'pass_mismatch']

export interface ScenarioStats {
  total: number
  passed: number
  failed: number
  errored: number
  unexpected: number
  aboveBand: number
  avgDeviation: number
}

export function computeStats(results: ScenarioResultRow[], surface: ScenarioSurface): ScenarioStats {
  const ok = results.filter((r) => !r.error)
  const devs = ok.map((r) => r.deviation).filter((d): d is number => typeof d === 'number')
  return {
    total: results.length,
    passed: results.filter((r) => !r.error && r.passed).length,
    failed: results.filter((r) => !r.error && !r.passed).length,
    errored: results.length - ok.length,
    unexpected: surface === 'coach' ? results.filter(isUnexpectedCompletion).length : 0,
    aboveBand: surface === 'voice' ? results.filter((r) => resultVerdict(r, 'voice') === 'score_above_band').length : 0,
    avgDeviation: devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : 0,
  }
}

function lightOf(s: ScenarioStats): Light {
  if (s.unexpected > 0 || s.aboveBand > 0) return 'red'
  if (s.failed > 0 || s.errored > 0) return 'yellow'
  return 'green'
}

const LIGHT_STYLE: Record<Light, string> = {
  green: 'border-success/30 bg-success/10 text-success',
  yellow: 'border-warning/30 bg-warning/10 text-warning',
  red: 'border-destructive/30 bg-destructive/10 text-destructive',
}

export function ScenarioLight({ stats, surface }: { stats: ScenarioStats; surface: ScenarioSurface }) {
  const t = useTranslations(`dashboard.teacher.aiEvals.scenarios.${surface}.light`)
  const light = lightOf(stats)
  const Icon = light === 'green' ? IconCircleCheck : light === 'yellow' ? IconAlertTriangle : IconAlertOctagon
  const count = surface === 'coach' ? stats.unexpected : stats.aboveBand
  return (
    <div role={light === 'red' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3', LIGHT_STYLE[light])}>
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{t(`${light}.title`, { count, issues: stats.failed + stats.errored })}</p>
        <p className="text-xs leading-relaxed opacity-90">{t(`${light}.body`, { count, issues: stats.failed + stats.errored })}</p>
      </div>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-xl font-semibold tabular-nums', tone === 'bad' && 'text-destructive')}>{value}</p>
    </div>
  )
}

export function ScenarioTiles({ stats, surface }: { stats: ScenarioStats; surface: ScenarioSurface }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.report.tiles')
  const flagged = surface === 'coach' ? stats.unexpected : stats.aboveBand
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label={t('passed')} value={`${stats.passed}/${stats.total}`} tone={stats.passed < stats.total ? 'bad' : undefined} />
      <Tile label={t(surface === 'coach' ? 'unexpectedCompletions' : 'scoreAboveBand')} value={String(flagged)} tone={flagged > 0 ? 'bad' : undefined} />
      <Tile label={t('errored')} value={String(stats.errored)} tone={stats.errored > 0 ? 'bad' : undefined} />
      <Tile label={t('avgDeviation')} value={`${Math.round(stats.avgDeviation)}/100`} />
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.report.verdict')
  const cls =
    verdict === 'ok' ? 'bg-success/10 text-success' : DESTRUCTIVE.includes(verdict) ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
  const Icon = verdict === 'ok' ? IconCheck : DESTRUCTIVE.includes(verdict) ? IconAlertOctagon : IconAlertTriangle
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
      {t(verdict)}
    </span>
  )
}

function Transcript({ messages, surface }: { messages: TranscriptMessage[]; surface: ScenarioSurface }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.report')
  if (messages.length === 0) return <p className="text-xs text-muted-foreground">{t('noTranscript')}</p>
  return (
    <ol className="space-y-2">
      {messages.map((m, i) => (
        <li key={i} className={cn('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
          <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed', m.role === 'user' ? 'bg-muted text-foreground' : 'bg-brand-tint text-foreground')}>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(m.role === 'user' ? 'student' : surface === 'coach' ? 'coach' : 'tutor')}
            </p>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h5 className="mb-1 font-semibold">{title}</h5>
      <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  )
}

function ResultDetail({ result, surface }: { result: ScenarioResultRow; surface: ScenarioSurface }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.report')
  const v = voiceOut(result)
  const c = coachOut(result)
  const unexpected = isUnexpectedCompletion(result)
  return (
    <div className="space-y-4 p-3">
      {result.error && <p className="text-xs text-destructive">{result.error}</p>}
      {unexpected && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          <IconAlertOctagon aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {t('unexpectedDetail', { turn: c?.completion_calls?.[0]?.turn ?? result.completed_turn ?? 0 })}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold">{t('transcript')}</h4>
          <Transcript messages={result.transcript ?? []} surface={surface} />
        </div>
        <div className="space-y-4 text-xs leading-relaxed">
          {v && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold">{t('voiceEvaluation')}</h4>
              <p className="tabular-nums">
                {t('voiceScoreLine', { score: Math.round(v.evaluation.score), passing: v.passing_score })}
                {' · '}
                {t(v.passed ? 'voicePassed' : 'voiceNotPassed')}
              </p>
              <p className="text-muted-foreground tabular-nums">
                {t('voiceStats', { turns: v.student_turns, hints: v.hints?.length ?? 0, corrections: v.corrections_logged })}
                {v.finish_reason ? ` · ${t(`finishReason.${v.finish_reason}`)}` : ''}
              </p>
              {v.evaluation.feedback && <p className="whitespace-pre-wrap text-muted-foreground">{v.evaluation.feedback}</p>}
              <List title={t('strengths')} items={v.evaluation.strengths ?? []} />
              <List title={t('improvements')} items={v.evaluation.improvements ?? []} />
            </div>
          )}
          <div>
            <h4 className="mb-2 text-xs font-semibold">{t('verdicts')}</h4>
            {(result.verdicts ?? []).length === 0 ? (
              <p className="text-muted-foreground">{t('noVerdicts')}</p>
            ) : (
              <ul className="space-y-2">
                {(result.verdicts ?? []).map((verdict, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {verdict.passed ? (
                      <IconCheck aria-label={t('verdictPassed')} className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <IconX aria-label={t('verdictFailed')} className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div>
                      <p className="font-medium">{verdict.criterion}</p>
                      {verdict.evidence && <p className="text-muted-foreground">{verdict.evidence}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CoachCells({ r }: { r: ScenarioResultRow }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.report')
  const te = useTranslations('dashboard.teacher.aiEvals.expected')
  const unexpected = isUnexpectedCompletion(r)
  const exp = coachExpectedCompleted(r)
  const turn = coachOut(r)?.completion_calls?.[0]?.turn ?? r.completed_turn
  const completed = coachOut(r)?.completed ?? r.completed
  return (
    <>
      <TableCell className="text-xs">{exp === undefined ? '-' : te(exp === true ? 'complete' : exp === false ? 'not_complete' : 'either')}</TableCell>
      <TableCell className={cn('text-xs', unexpected && 'font-semibold text-destructive')}>
        {r.error ? '-' : completed ? t('markedCompleteAt', { turn: turn ?? 0 }) : t('notMarkedComplete')}
      </TableCell>
    </>
  )
}

function VoiceCells({ r }: { r: ScenarioResultRow }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.report')
  const te = useTranslations('dashboard.teacher.aiEvals.scenarios.voice.expected')
  const exp = voiceExpected(r)
  const out = voiceOut(r)
  const score = out ? Math.round(out.evaluation.score) : (r.score ?? null)
  const bits: string[] = []
  if (exp) {
    if (exp.score_min != null || exp.score_max != null) bits.push(te('summaryBand', { min: exp.score_min ?? 0, max: exp.score_max ?? 100 }))
    const pas = triKey(exp.passed)
    if (pas !== 'either') bits.push(te(pas === 'yes' ? 'summaryPass' : 'summaryFail'))
    const fin = triKey(exp.finished)
    if (fin !== 'either') bits.push(te(fin === 'yes' ? 'summaryFinished' : 'summaryNotFinished'))
  }
  const finished = out?.finished ?? r.completed
  return (
    <>
      <TableCell className="text-xs">{bits.length ? bits.join(' · ') : exp ? te('either') : '-'}</TableCell>
      <TableCell className="text-xs tabular-nums">
        {r.error || score == null ? '-' : t('scoreFinished', { score, finished: finished ? t('finishedYes') : t('finishedNo') })}
      </TableCell>
    </>
  )
}

export function ScenarioResultsTable({ results, surface }: { results: ScenarioResultRow[]; surface: ScenarioSurface }) {
  const t = useTranslations('dashboard.teacher.aiEvals.scenarios.common.report')
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="max-w-full min-w-0 overflow-x-auto rounded-lg border">
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t('cols.case')}</TableHead>
            <TableHead>{t('cols.expected')}</TableHead>
            <TableHead>{t(surface === 'coach' ? 'cols.coachResult' : 'cols.voiceResult')}</TableHead>
            <TableHead>{t('cols.deviation')}</TableHead>
            <TableHead>{t('cols.result')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => {
            const expanded = open === r.id
            const Chevron = expanded ? IconChevronDown : IconChevronRight
            const verdict = resultVerdict(r, surface)
            return (
              <Fragment key={r.id}>
                <TableRow className={cn(verdict === 'unexpected_completion' && 'bg-destructive/5')}>
                  <TableCell className="w-56 max-w-56 min-w-0">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : r.id)}
                      title={r.case_name}
                      className="flex w-full min-w-0 items-center gap-1.5 rounded text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      <Chevron aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{r.case_name}</span>
                    </button>
                  </TableCell>
                  {surface === 'coach' ? <CoachCells r={r} /> : <VoiceCells r={r} />}
                  <TableCell className="text-xs tabular-nums">{r.error || r.deviation == null ? '-' : Math.round(r.deviation)}</TableCell>
                  <TableCell>
                    <VerdictBadge verdict={verdict} />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={5} className="whitespace-normal">
                      <ResultDetail result={r} surface={surface} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

