'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle, IconFlask, IconPlayerPlay, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AiErrorNotice } from '@/components/ai/ai-error-notice'
import type { EvalCaseRow } from '@/lib/ai/evals/schema'
import { EditScenarioDialog, GoldenCard, ScenarioCard, expectedValue, type ExpectedKey, type ScenarioPatch } from './case-cards'
import {
  isActive,
  ReportSkeleton,
  ResultsTable,
  StatusPill,
  SummaryTiles,
  versionNo,
  type RunResult,
  type RunRow,
} from './run-report'
import { DRIFT_THRESHOLD, evalRequest, type AiSetupError, type EvalDraft } from './types'

interface Props {
  lessonId: number
  draft: EvalDraft
  hasUnsavedChanges: boolean
}

interface MetricsRow {
  version_id: string
  version_no: number
  created_at: string
  students: number
  completed: number
  median_turns_to_complete: number | null
  abandoned: number
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T }

const POLL_MS = 3000

export function LessonTaskTestsPanel({ lessonId, draft, hasUnsavedChanges }: Props) {
  const t = useTranslations('dashboard.teacher.aiEvals')
  const base = `/api/teacher/evals/lesson-task/${lessonId}`

  const [cases, setCases] = useState<Load<{ cases: EvalCaseRow[]; autoRegenerate: boolean }>>({ state: 'loading' })
  const [runs, setRuns] = useState<Load<RunRow[]>>({ state: 'loading' })
  const [metrics, setMetrics] = useState<Load<MetricsRow[]>>({ state: 'loading' })
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Load<{ run: RunRow; results: RunResult[] }> | null>(null)

  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiSetupError | null>(null)
  const [editing, setEditing] = useState<EvalCaseRow | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // The draft changes on every keystroke; actions read the latest through a ref
  // so the loaders below stay stable.
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const loadCases = useCallback(async () => {
    const res = await evalRequest<{ cases: EvalCaseRow[]; suite: { auto_regenerate: boolean } }>(`${base}/cases`)
    if (!res.ok || !res.data) return setCases({ state: 'error' })
    setCases({ state: 'ready', data: { cases: res.data.cases ?? [], autoRegenerate: Boolean(res.data.suite?.auto_regenerate) } })
  }, [base])

  const loadRuns = useCallback(async () => {
    const res = await evalRequest<{ runs: RunRow[] }>(`${base}/runs`)
    if (!res.ok || !res.data) return setRuns({ state: 'error' })
    setRuns({ state: 'ready', data: res.data.runs ?? [] })
    return res.data.runs ?? []
  }, [base])

  const loadMetrics = useCallback(async () => {
    const res = await evalRequest<{ versions: MetricsRow[] }>(`${base}/metrics`)
    if (!res.ok || !res.data) return setMetrics({ state: 'error' })
    setMetrics({ state: 'ready', data: res.data.versions ?? [] })
  }, [base])

  useEffect(() => {
    // Data fetch on mount: state is only set once the requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCases()
    void loadMetrics()
    void loadRuns().then((list) => {
      if (list && list.length > 0) setSelectedRunId((current) => current ?? list[0].id)
    })
  }, [loadCases, loadRuns, loadMetrics])

  const loadDetail = useCallback(async (runId: string, silent = false) => {
    if (!silent) setDetail({ state: 'loading' })
    const res = await evalRequest<{ run: RunRow; results: RunResult[] }>(`/api/teacher/evals/runs/${runId}`)
    if (!res.ok || !res.data) {
      if (!silent) setDetail({ state: 'error' })
      return
    }
    setDetail({ state: 'ready', data: { run: res.data.run, results: res.data.results ?? [] } })
    return res.data.run
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedRunId) void loadDetail(selectedRunId)
    else setDetail(null)
  }, [selectedRunId, loadDetail])

  // Poll while the selected run is still going; refresh the history when it ends.
  const activeStatus = detail?.state === 'ready' ? detail.data.run.status : null
  useEffect(() => {
    if (!selectedRunId || (activeStatus !== 'queued' && activeStatus !== 'running')) return
    const timer = setInterval(async () => {
      const run = await loadDetail(selectedRunId, true)
      if (run && !isActive(run)) {
        void loadRuns()
        void loadMetrics()
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [selectedRunId, activeStatus, loadDetail, loadRuns, loadMetrics])

  const caseList = useMemo(() => (cases.state === 'ready' ? cases.data.cases : []), [cases])
  const goldens = caseList.filter((c) => c.kind === 'golden_chat')
  const scenarios = caseList.filter((c) => c.kind === 'scenario')
  const runList = runs.state === 'ready' ? runs.data : []
  const runActive = runList.some(isActive) || isActive(detail?.state === 'ready' ? detail.data.run : null)

  const expectedByCase = useMemo(() => new Map(caseList.map((c) => [c.id, c.expected])), [caseList])

  const fail = (res: Awaited<ReturnType<typeof evalRequest>>, fallbackKey: string) => {
    if (res.aiError) {
      setAiError(res.aiError)
      return
    }
    const known = ['no_cases', 'run_in_progress', 'no_task', 'run_limit', 'case_limit']
    setError(res.code && known.includes(res.code) ? t(`errors.${res.code}`) : t(fallbackKey))
  }

  const clearErrors = () => {
    setError(null)
    setAiError(null)
  }

  const startRun = async () => {
    clearErrors()
    setStarting(true)
    const res = await evalRequest<{ run: { id: string } }>(`${base}/runs`, {
      method: 'POST',
      body: JSON.stringify({ draft: draftRef.current }),
    })
    setStarting(false)
    if (!res.ok || !res.data) return fail(res, 'errors.runFailed')
    await loadRuns()
    setSelectedRunId(res.data.run.id)
  }

  const generate = async () => {
    clearErrors()
    setGenerating(true)
    const res = await evalRequest(`${base}/generate`, { method: 'POST', body: JSON.stringify({ draft: draftRef.current, count: 4 }) })
    setGenerating(false)
    if (!res.ok) return fail(res, 'errors.generateFailed')
    await loadCases()
  }

  const patchCase = async (id: string, body: unknown) => {
    const res = await evalRequest(`/api/teacher/evals/cases/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    return res
  }

  const changeExpected = async (item: EvalCaseRow, next: ExpectedKey) => {
    clearErrors()
    setBusy(true)
    const res = await patchCase(item.id, { expected: { completed: expectedValue(next) } })
    setBusy(false)
    if (!res.ok) return fail(res, 'errors.saveFailed')
    await loadCases()
  }

  const deleteCase = async (item: EvalCaseRow) => {
    clearErrors()
    setBusy(true)
    const res = await evalRequest(`/api/teacher/evals/cases/${item.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) return fail(res, 'errors.deleteFailed')
    await loadCases()
  }

  const saveScenario = async (patch: ScenarioPatch) => {
    if (!editing) return
    setEditSaving(true)
    setEditError(null)
    const res = await patchCase(editing.id, patch)
    setEditSaving(false)
    if (!res.ok) return setEditError(t('errors.saveFailed'))
    setEditing(null)
    await loadCases()
  }

  const toggleAuto = async (checked: boolean) => {
    if (cases.state !== 'ready') return
    clearErrors()
    const previous = cases.data
    setCases({ state: 'ready', data: { ...previous, autoRegenerate: checked } })
    const res = await evalRequest(`${base}/suite`, { method: 'PATCH', body: JSON.stringify({ auto_regenerate: checked }) })
    if (!res.ok) {
      setCases({ state: 'ready', data: previous })
      fail(res, 'errors.saveFailed')
    }
  }

  const caseCount = caseList.length
  const canRun = caseCount > 0 && !runActive && !starting
  const latestRun = runList[0]
  const staleBanner = hasUnsavedChanges && latestRun && !isActive(latestRun)

  const detailRun = detail?.state === 'ready' ? detail.data.run : null
  const threshold = detailRun?.summary?.drift_threshold ?? DRIFT_THRESHOLD
  const results = detail?.state === 'ready' ? detail.data.results.map((r) => ({ ...r, expected: r.expected ?? expectedByCase.get(r.case_id) ?? null })) : []

  return (
    <section aria-labelledby="ai-evals-title" className="mt-10 space-y-6 border-t pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
            <IconFlask aria-hidden="true" className="h-5 w-5 text-brand-text" />
          </div>
          <div className="max-w-prose">
            <h3 id="ai-evals-title" className="text-base font-semibold tracking-tight">
              {t('title')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button type="button" className="gap-2" onClick={startRun} disabled={!canRun}>
            <IconPlayerPlay aria-hidden="true" className="h-4 w-4" />
            {starting ? t('run.starting') : t('run.button', { count: caseCount })}
          </Button>
          <p className="text-xs text-muted-foreground">{t('run.byok')}</p>
        </div>
      </div>

      {staleBanner && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
          <IconAlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {t('staleBanner')}
        </p>
      )}

      {aiError && (
        <AiErrorNotice code={aiError.code} canConfigure={aiError.canConfigure} settingsUrl={aiError.settingsUrl} audience="teacher" />
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Goldens */}
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">{t('goldens.title')}</h4>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('goldens.description')}</p>
        </div>
        {cases.state === 'loading' ? (
          <Skeleton className="h-24 rounded-lg" aria-hidden="true" />
        ) : cases.state === 'error' ? (
          <LoadError onRetry={loadCases} />
        ) : goldens.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('goldens.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {goldens.map((item) => (
              <GoldenCard key={item.id} item={item} busy={busy} onExpected={changeExpected} onDelete={deleteCase} />
            ))}
          </ul>
        )}
      </div>

      {/* Scenarios */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose">
            <h4 className="text-sm font-semibold">{t('scenarios.title')}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('scenarios.description')}</p>
          </div>
          {scenarios.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generate} disabled={generating || busy}>
              <IconRefresh aria-hidden="true" className="h-3.5 w-3.5" />
              {generating ? t('scenarios.generating') : t('scenarios.regenerate')}
            </Button>
          )}
        </div>
        {cases.state === 'loading' ? (
          <Skeleton className="h-24 rounded-lg" aria-hidden="true" />
        ) : cases.state === 'error' ? null : scenarios.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed px-4 py-5">
            <p className="text-sm text-muted-foreground">{t('scenarios.empty')}</p>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generate} disabled={generating}>
              <IconSparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {generating ? t('scenarios.generating') : t('scenarios.generate')}
            </Button>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {scenarios.map((item) => (
                <ScenarioCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  onExpected={changeExpected}
                  onDelete={deleteCase}
                  onEdit={(c) => {
                    setEditError(null)
                    setEditing(c)
                  }}
                />
              ))}
            </ul>
            <label className="flex items-center gap-2.5 text-sm">
              <Switch checked={cases.data.autoRegenerate} onCheckedChange={toggleAuto} />
              <span>{t('scenarios.autoRegenerate')}</span>
            </label>
          </>
        )}
      </div>

      {/* Latest run report */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">{t('run.title')}</h4>
          {runList.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t('run.history')}
              <select
                value={selectedRunId ?? ''}
                onChange={(e) => setSelectedRunId(e.target.value || null)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {runList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t('run.historyItem', {
                      version: versionNo(r) ?? '-',
                      date: new Date(r.created_at).toLocaleString(),
                    })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {runs.state === 'loading' || detail?.state === 'loading' ? (
          <ReportSkeleton />
        ) : runs.state === 'error' ? (
          <LoadError onRetry={loadRuns} />
        ) : !detail ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('run.empty')}</p>
        ) : detail.state === 'error' ? (
          <LoadError onRetry={() => selectedRunId && loadDetail(selectedRunId)} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusPill run={detail.data.run} />
              {versionNo(detail.data.run) != null && <span>{t('run.version', { version: versionNo(detail.data.run) ?? 0 })}</span>}
            </div>
            {detail.data.run.status === 'failed' && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {t('run.failedReason', { reason: detail.data.run.error ?? t('run.unknownError') })}
              </p>
            )}
            {isActive(detail.data.run) && <p className="text-xs text-muted-foreground">{t('run.inProgress')}</p>}
            <SummaryTiles summary={detail.data.run.summary} />
            {results.length > 0 && <ResultsTable results={results} threshold={threshold} />}
          </div>
        )}
      </div>

      {/* Real students */}
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">{t('metrics.title')}</h4>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('metrics.description')}</p>
        </div>
        {metrics.state === 'loading' ? (
          <Skeleton className="h-20 rounded-lg" aria-hidden="true" />
        ) : metrics.state === 'error' ? (
          <LoadError onRetry={loadMetrics} />
        ) : metrics.data.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('metrics.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('metrics.cols.version')}</TableHead>
                  <TableHead>{t('metrics.cols.students')}</TableHead>
                  <TableHead>{t('metrics.cols.completed')}</TableHead>
                  <TableHead>{t('metrics.cols.median')}</TableHead>
                  <TableHead>{t('metrics.cols.abandoned')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.data.map((m) => (
                  <TableRow key={m.version_id}>
                    <TableCell className="text-xs font-medium">v{m.version_no}</TableCell>
                    <TableCell className="text-xs tabular-nums">{m.students}</TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {m.students > 0 ? `${Math.round((m.completed / m.students) * 100)}%` : '-'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{m.median_turns_to_complete ?? '-'}</TableCell>
                    <TableCell className="text-xs tabular-nums">{m.abandoned}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {editing && (
        <EditScenarioDialog
          key={editing.id}
          item={editing}
          onClose={() => setEditing(null)}
          onSave={saveScenario}
          saving={editSaving}
          error={editError}
        />
      )}
    </section>
  )
}

function LoadError({ onRetry }: { onRetry: () => unknown }) {
  const t = useTranslations('dashboard.teacher.aiEvals.errors')
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <span>{t('load')}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
        {t('retry')}
      </Button>
    </div>
  )
}
