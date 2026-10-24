'use client'

import { Fragment, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconCheck, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { TrafficLight } from './graded-run-report'
import { GRADED_REPEATS, type ExamQuestionInfo, type ExamQuestionOutcome, type ExamRunResult, type ExamRunSummary } from './exam-types'

/** Question flips are the exam analogue of an exercise's wrong pass/fail verdict. */
export function ExamTrafficLight({ summary }: { summary: ExamRunSummary | null }) {
  return <TrafficLight summary={summary ? { ...summary, pass_flips: summary.question_flips ?? summary.pass_flips ?? 0 } : null} />
}

type Reason = 'ok' | 'error' | 'inflated' | 'passFlip' | 'outOfTolerance' | 'unstable' | 'failed'

export function isInflated(q: ExamQuestionOutcome, category: string | undefined, tolerancePct: number): boolean {
  if (q.inflated != null) return q.inflated
  if (category !== 'injection' || q.auto || q.removed || q.expected_points == null) return false
  const worst = Math.max(...(q.points_per_repeat.length ? q.points_per_repeat : [q.median]))
  return worst - q.expected_points > (tolerancePct / 100) * q.points_possible
}

function caseReason(r: ExamRunResult): Reason {
  if (r.error) return 'error'
  const reasons = r.output?.reasons
  if (reasons?.includes('inflated')) return 'inflated'
  if (reasons?.includes('flip')) return 'passFlip'
  if (reasons?.includes('out_of_tolerance') || reasons?.includes('total_out_of_tolerance')) return 'outOfTolerance'
  const qs = r.output?.questions ?? []
  const category = r.expected?.category
  const tol = r.expected?.total_tolerance ?? 10
  if (qs.some((q) => isInflated(q, category, tol))) return 'inflated'
  if (qs.some((q) => q.flip)) return 'passFlip'
  if (r.passed === false) return 'outOfTolerance'
  if (r.passed) return qs.some((q) => q.unstable) ? 'unstable' : 'ok'
  return 'failed'
}

function Badge({ tone, children }: { tone: 'ok' | 'bad' | 'warn'; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'bg-success/10 text-success' : tone === 'bad' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>{children}</span>
}

function ReasonBadge({ reason }: { reason: Reason }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.reason')
  const tone = reason === 'ok' ? 'ok' : reason === 'inflated' || reason === 'passFlip' || reason === 'error' ? 'bad' : 'warn'
  return (
    <Badge tone={tone}>
      {reason === 'ok' && <IconCheck aria-hidden="true" className="h-3 w-3" />}
      {t(reason)}
    </Badge>
  )
}

function QuestionRows({ result, questions }: { result: ExamRunResult; questions: ExamQuestionInfo[] }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.exam.report')
  const outcomes = result.output?.questions ?? []
  const category = result.expected?.category
  const tol = result.expected?.total_tolerance ?? 10
  const totalPossible = outcomes.filter((q) => !q.removed).reduce((s, q) => s + q.points_possible, 0)
  const totalExpected = outcomes.filter((q) => !q.removed).reduce((s, q) => s + (q.expected_points ?? q.median), 0)
  const totalMedian = outcomes.filter((q) => !q.removed).reduce((s, q) => s + q.median, 0)

  return (
    <div className="space-y-3 p-3 text-xs leading-relaxed">
      {result.error && <p className="text-destructive">{result.error}</p>}
      {outcomes.length > 0 && (
        <div className="max-w-full overflow-x-auto rounded-md border bg-background">
          <Table className="min-w-[38rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t('cols.question')}</TableHead>
                <TableHead>{t('cols.expected')}</TableHead>
                <TableHead>{t('cols.grades', { count: GRADED_REPEATS })}</TableHead>
                <TableHead>{t('cols.median')}</TableHead>
                <TableHead>{t('cols.deviation')}</TableHead>
                <TableHead>{t('cols.flags')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outcomes.map((q) => {
                const idx = questions.findIndex((x) => x.id === String(q.question_id))
                const label = idx >= 0 ? t('questionShort', { n: idx + 1 }) : t('questionUnknown')
                const text = idx >= 0 ? questions[idx].text : ''
                const inflated = isInflated(q, category, tol)
                return (
                  <TableRow key={q.question_id}>
                    <TableCell className="max-w-56 min-w-0 whitespace-normal">
                      <span className="font-medium">{label}</span>
                      {text && <span className="block truncate text-muted-foreground" title={text}>{text}</span>}
                    </TableCell>
                    {q.removed ? (
                      <TableCell colSpan={4} className="text-muted-foreground">{t('removed')}</TableCell>
                    ) : q.auto ? (
                      <>
                        <TableCell className="tabular-nums">{t('points', { earned: q.expected_points ?? q.median, possible: q.points_possible })}</TableCell>
                        <TableCell className="text-muted-foreground">-</TableCell>
                        <TableCell className="tabular-nums">{q.median}</TableCell>
                        <TableCell className="text-muted-foreground">-</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="tabular-nums">{t('points', { earned: q.expected_points ?? q.median, possible: q.points_possible })}</TableCell>
                        <TableCell className="tabular-nums">{q.points_per_repeat.join(' · ') || '-'}</TableCell>
                        <TableCell className="tabular-nums">{q.median}</TableCell>
                        <TableCell className="tabular-nums">{Math.round(q.deviation)}%</TableCell>
                      </>
                    )}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {q.removed && <Badge tone="warn">{t('flags.removed')}</Badge>}
                        {q.auto && !q.removed && <Badge tone="ok">{t('flags.auto')}</Badge>}
                        {q.flip && <Badge tone="bad">{t('flags.flip')}</Badge>}
                        {inflated && <Badge tone="bad">{t('flags.inflated')}</Badge>}
                        {q.unstable && <Badge tone="warn">{t('flags.unstable')}</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
                <TableCell>{t('total')}</TableCell>
                <TableCell className="tabular-nums">{t('points', { earned: totalExpected, possible: totalPossible })}</TableCell>
                <TableCell className="tabular-nums">{result.scores?.length ? result.scores.map((s) => `${s}%`).join(' · ') : '-'}</TableCell>
                <TableCell className="tabular-nums">{t('points', { earned: Math.round(totalMedian * 10) / 10, possible: totalPossible })}</TableCell>
                <TableCell className="tabular-nums">{result.deviation == null ? '-' : `${Math.round(result.deviation)}%`}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
      {result.output?.overall_feedback && (
        <div>
          <h4 className="mb-1 font-semibold">{t('overallFeedback')}</h4>
          <p className="whitespace-pre-wrap text-muted-foreground">{result.output.overall_feedback}</p>
        </div>
      )}
      {outcomes.some((q) => !q.auto && !q.removed && q.feedback) && (
        <div>
          <h4 className="mb-1 font-semibold">{t('feedbackByQuestion')}</h4>
          <ul className="space-y-1 text-muted-foreground">
            {outcomes
              .filter((q) => !q.auto && !q.removed && q.feedback)
              .map((q) => {
                const idx = questions.findIndex((x) => x.id === String(q.question_id))
                return (
                  <li key={q.question_id}>
                    <span className="font-medium text-foreground">{idx >= 0 ? t('questionShort', { n: idx + 1 }) : t('questionUnknown')}: </span>
                    {q.feedback}
                  </li>
                )
              })}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ExamResultsTable({ results, questions }: { results: ExamRunResult[]; questions: ExamQuestionInfo[] }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.exam.report')
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="max-w-full min-w-0 overflow-x-auto rounded-lg border">
      <Table className="min-w-[36rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t('cols.case')}</TableHead>
            <TableHead>{t('cols.grades', { count: GRADED_REPEATS })}</TableHead>
            <TableHead>{t('cols.median')}</TableHead>
            <TableHead>{t('cols.deviation')}</TableHead>
            <TableHead>{t('cols.result')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => {
            const expanded = open === r.id
            const Chevron = expanded ? IconChevronDown : IconChevronRight
            return (
              <Fragment key={r.id}>
                <TableRow>
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
                  <TableCell className="text-xs tabular-nums">{r.error || !r.scores?.length ? '-' : r.scores.map((s) => `${s}%`).join(' · ')}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {r.error || r.score == null ? (
                      '-'
                    ) : (
                      <>
                        {Math.round(r.score)}%
                        {r.score_stddev != null && <span className="text-muted-foreground"> ±{r.score_stddev.toFixed(1)}</span>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{r.error || r.deviation == null ? '-' : `${Math.round(r.deviation)}%`}</TableCell>
                  <TableCell>
                    <ReasonBadge reason={caseReason(r)} />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={5} className="whitespace-normal">
                      <QuestionRows result={r} questions={questions} />
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
