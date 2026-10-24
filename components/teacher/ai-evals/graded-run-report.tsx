'use client'

import { Fragment, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertOctagon, IconAlertTriangle, IconCheck, IconChevronDown, IconChevronRight, IconCircleCheck } from '@tabler/icons-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { RunRow } from './run-report'
import { GRADED_REPEATS, type GradedRunResult, type GradedRunSummary } from './types'

export interface GradedRunRow extends Omit<RunRow, 'summary'> {
  summary: GradedRunSummary | null
}

export type Light = 'green' | 'yellow' | 'red'

/**
 * Red: an injection raised a grade or a majority verdict was wrong.
 * Yellow: any other failure, error or unstable case. Green: all pass.
 */
export function trafficLight(summary: GradedRunSummary | null | undefined): Light {
  if (!summary) return 'yellow'
  if ((summary.inflated_injections ?? 0) > 0 || (summary.pass_flips ?? 0) > 0) return 'red'
  if ((summary.failed ?? 0) > 0 || (summary.errors ?? 0) > 0 || (summary.unstable_cases ?? 0) > 0) return 'yellow'
  return 'green'
}

export type Reason = 'ok' | 'error' | 'inflated' | 'passFlip' | 'outOfTolerance' | 'unstable' | 'failed'

/** The row's badge, from the verdict details the runner stored with the result. */
export function resultReason(r: GradedRunResult): Reason {
  if (r.error) return 'error'
  const reasons = r.output?.reasons
  if (reasons?.includes('inflated')) return 'inflated'
  if (reasons?.includes('pass_flip')) return 'passFlip'
  if (reasons?.includes('out_of_tolerance')) return 'outOfTolerance'
  if (r.passed) return r.output?.unstable ? 'unstable' : 'ok'
  return 'failed'
}

const LIGHT_STYLE: Record<Light, string> = {
  green: 'border-success/30 bg-success/10 text-success',
  yellow: 'border-warning/30 bg-warning/10 text-warning',
  red: 'border-destructive/30 bg-destructive/10 text-destructive',
}

export function TrafficLight({ summary }: { summary: GradedRunSummary | null }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.light')
  const light = trafficLight(summary)
  const Icon = light === 'green' ? IconCircleCheck : light === 'yellow' ? IconAlertTriangle : IconAlertOctagon
  return (
    <div role="status" className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3', LIGHT_STYLE[light])}>
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">
          {t(`${light}.title`, { issues: (summary?.failed ?? 0) + (summary?.errors ?? 0) + (summary?.unstable_cases ?? 0) })}
        </p>
        <p className="text-xs leading-relaxed opacity-90">
          {t(`${light}.body`, { inflated: summary?.inflated_injections ?? 0, flips: summary?.pass_flips ?? 0, unstable: summary?.unstable_cases ?? 0 })}
        </p>
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

export function GradedSummaryTiles({ summary }: { summary: GradedRunSummary | null }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.tiles')
  if (!summary) return null
  const total = summary.total ?? 0
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label={t('passed')} value={`${summary.passed ?? 0}/${total}`} tone={(summary.passed ?? 0) < total ? 'bad' : undefined} />
      <Tile label={t('meanDeviation')} value={`${Math.round(summary.mean_deviation ?? 0)}`} />
      <Tile label={t('maxStddev')} value={`±${(summary.max_stddev ?? 0).toFixed(1)}`} />
      <Tile label={t('modelCalls')} value={String(summary.model_calls ?? 0)} />
    </div>
  )
}

function ReasonBadge({ reason }: { reason: Reason }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.reason')
  const cls =
    reason === 'ok'
      ? 'bg-success/10 text-success'
      : reason === 'inflated' || reason === 'passFlip' || reason === 'error'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-warning/10 text-warning'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      {reason === 'ok' && <IconCheck aria-hidden="true" className="h-3 w-3" />}
      {t(reason)}
    </span>
  )
}

function ResultDetail({ result, nextStep = false }: { result: GradedRunResult; nextStep?: boolean }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.report')
  const out = result.output
  return (
    <div className="space-y-3 p-3 text-xs leading-relaxed">
      {result.error && <p className="text-destructive">{result.error}</p>}
      {out?.feedback ? (
        <div>
          <h4 className="mb-1 font-semibold">{t('feedback')}</h4>
          <p className="whitespace-pre-wrap text-muted-foreground">{out.feedback}</p>
        </div>
      ) : (
        !result.error && <p className="text-muted-foreground">{t('noFeedback')}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {(out?.strengths?.length ?? 0) > 0 && (
          <div>
            <h4 className="mb-1 font-semibold">{t('strengths')}</h4>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {out?.strengths?.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {(out?.improvements?.length ?? 0) > 0 && (
          <div>
            <h4 className="mb-1 font-semibold">{t(nextStep ? 'nextStep' : 'improvements')}</h4>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {out?.improvements?.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function GradedResultsTable({ results, nextStep = false }: { results: GradedRunResult[]; nextStep?: boolean }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.report')
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="max-w-full min-w-0 overflow-x-auto rounded-lg border">
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t('cols.case')}</TableHead>
            <TableHead>{t('cols.expected')}</TableHead>
            <TableHead>{t('cols.scores', { count: GRADED_REPEATS })}</TableHead>
            <TableHead>{t('cols.median')}</TableHead>
            <TableHead>{t('cols.deviation')}</TableHead>
            <TableHead>{t('cols.result')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => {
            const expanded = open === r.id
            const Chevron = expanded ? IconChevronDown : IconChevronRight
            const reason = resultReason(r)
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
                  <TableCell className="text-xs tabular-nums">
                    {r.expected ? t('expectedRange', { score: r.expected.score, tolerance: r.expected.tolerance }) : '-'}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{r.error || !r.scores?.length ? '-' : r.scores.join(' · ')}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {r.error || r.score == null ? (
                      '-'
                    ) : (
                      <>
                        {Math.round(r.score)}
                        {r.score_stddev != null && <span className="text-muted-foreground"> ±{r.score_stddev.toFixed(1)}</span>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{r.error || r.deviation == null ? '-' : Math.round(r.deviation)}</TableCell>
                  <TableCell>
                    <ReasonBadge reason={reason} />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={6} className="whitespace-normal">
                      <ResultDetail result={r} nextStep={nextStep} />
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
