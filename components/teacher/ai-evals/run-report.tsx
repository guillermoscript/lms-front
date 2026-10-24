'use client'

import { Fragment, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle, IconCheck, IconChevronDown, IconChevronRight, IconLoader2, IconX } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { CriterionVerdict, EvalExpected, RunSummary, TranscriptMessage } from '@/lib/ai/evals/schema'
import { expectedKey, ExpectedBadge } from './case-cards'
import { DRIFT_THRESHOLD } from './types'

export interface RunRow {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed' | string
  summary: (Partial<RunSummary> & { drift_threshold?: number }) | null
  model_ids?: unknown
  error: string | null
  created_at: string
  finished_at: string | null
  version_id?: string | null
  ai_config_versions?: { version_no: number } | { version_no: number }[] | null
}

export interface RunResult {
  id: string
  case_id: string
  case_name: string
  case_kind: 'golden_chat' | 'scenario'
  expected?: EvalExpected | null
  transcript: TranscriptMessage[]
  completed: boolean
  completed_turn: number | null
  verdicts: CriterionVerdict[]
  deviation: number
  passed: boolean
  error: string | null
}

export function versionNo(run: RunRow): number | null {
  const v = run.ai_config_versions
  if (!v) return null
  return Array.isArray(v) ? (v[0]?.version_no ?? null) : v.version_no
}

export function isActive(run: Pick<RunRow, 'status'> | undefined | null) {
  return run?.status === 'queued' || run?.status === 'running'
}

export function StatusPill({ run }: { run: Pick<RunRow, 'status'> }) {
  const t = useTranslations('dashboard.teacher.aiEvals.run.status')
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium'
  if (isActive(run)) {
    return (
      <span className={cn(base, 'bg-brand-tint text-brand-text')} role="status">
        <IconLoader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" />
        {t(run.status === 'queued' ? 'queued' : 'running')}
      </span>
    )
  }
  if (run.status === 'failed') {
    return (
      <span className={cn(base, 'bg-destructive/10 text-destructive')}>
        <IconX aria-hidden="true" className="h-3.5 w-3.5" />
        {t('failed')}
      </span>
    )
  }
  return (
    <span className={cn(base, 'bg-success/10 text-success')}>
      <IconCheck aria-hidden="true" className="h-3.5 w-3.5" />
      {t('done')}
    </span>
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

export function SummaryTiles({ summary }: { summary: RunRow['summary'] }) {
  const t = useTranslations('dashboard.teacher.aiEvals.run.tiles')
  if (!summary) return null
  const total = summary.total ?? 0
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label={t('passed')} value={`${summary.passed ?? 0}/${total}`} tone={(summary.passed ?? 0) < total ? 'bad' : undefined} />
      <Tile label={t('verdictChanges')} value={String(summary.verdict_changes ?? 0)} />
      <Tile label={t('avgDeviation')} value={`${Math.round(summary.avg_deviation ?? 0)}/100`} />
      <Tile label={t('modelCalls')} value={String(summary.model_calls ?? 0)} />
    </div>
  )
}

function DeviationBadge({ result, threshold }: { result: RunResult; threshold: number }) {
  const t = useTranslations('dashboard.teacher.aiEvals.run.deviation')
  if (result.error) {
    return (
      <Badge variant="destructive">
        <IconAlertTriangle aria-hidden="true" />
        {t('error')}
      </Badge>
    )
  }
  const drifted = result.deviation >= threshold
  const cls = !result.passed
    ? 'bg-destructive/10 text-destructive'
    : drifted
      ? 'bg-warning/10 text-warning'
      : 'bg-success/10 text-success'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', cls)}>
      {Math.round(result.deviation)}
      <span className="font-normal">· {t(!result.passed ? 'failed' : drifted ? 'drifted' : 'ok')}</span>
    </span>
  )
}

function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  const t = useTranslations('dashboard.teacher.aiEvals.run')
  if (messages.length === 0) return <p className="text-xs text-muted-foreground">{t('noTranscript')}</p>
  return (
    <ol className="space-y-2">
      {messages.map((m, i) => (
        <li key={i} className={cn('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
          <div
            className={cn(
              'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
              m.role === 'user' ? 'bg-muted text-foreground' : 'bg-brand-tint text-foreground'
            )}
          >
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(m.role === 'user' ? 'student' : 'tutor')}
            </p>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ResultDetail({ result }: { result: RunResult }) {
  const t = useTranslations('dashboard.teacher.aiEvals.run')
  return (
    <div className="grid gap-4 p-3 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-semibold">{t('transcript')}</h4>
        <Transcript messages={result.transcript ?? []} />
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold">{t('verdicts')}</h4>
        {result.error && <p className="mb-2 text-xs text-destructive">{result.error}</p>}
        {(result.verdicts ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noVerdicts')}</p>
        ) : (
          <ul className="space-y-2">
            {result.verdicts.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {v.passed ? (
                  <IconCheck aria-label={t('verdictPassed')} className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <IconX aria-label={t('verdictFailed')} className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div>
                  <p className="font-medium">{v.criterion}</p>
                  {v.evidence && <p className="text-muted-foreground">{v.evidence}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function ResultsTable({ results, threshold }: { results: RunResult[]; threshold: number }) {
  const t = useTranslations('dashboard.teacher.aiEvals.run')
  const tc = useTranslations('dashboard.teacher.aiEvals.cases')
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('cols.case')}</TableHead>
            <TableHead>{t('cols.kind')}</TableHead>
            <TableHead>{t('cols.expected')}</TableHead>
            <TableHead>{t('cols.result')}</TableHead>
            <TableHead>{t('cols.deviation')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => {
            const expanded = open === r.id
            const Chevron = expanded ? IconChevronDown : IconChevronRight
            return (
              <Fragment key={r.id}>
                <TableRow>
                  <TableCell className="max-w-64">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : r.id)}
                      className="flex items-center gap-1.5 rounded text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      <Chevron aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{r.case_name}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{tc(r.case_kind === 'golden_chat' ? 'kindGolden' : 'kindScenario')}</TableCell>
                  <TableCell>{r.expected ? <ExpectedBadge value={expectedKey(r.expected.completed)} /> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-xs">
                    {r.error
                      ? '-'
                      : r.completed
                        ? t('completedAt', { turn: r.completed_turn ?? 0 })
                        : t('notCompleted')}
                  </TableCell>
                  <TableCell>
                    <DeviationBadge result={r} threshold={threshold} />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={5} className="whitespace-normal">
                      <ResultDetail result={r} />
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

export function ReportSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-lg" />
    </div>
  )
}

export { DRIFT_THRESHOLD }
