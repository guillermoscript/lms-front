'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle, IconFlask, IconMicrophone, IconPlayerPlay, IconPlus, IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AiErrorNotice } from '@/components/ai/ai-error-notice'
import { ScenarioCaseCard, ScenarioCaseDialog, type ScenarioCasePatch } from './scenario-case-cards'
import {
  computeStats,
  ScenarioLight,
  ScenarioResultsTable,
  ScenarioTiles,
  surfaceResults,
} from './scenario-run-report'
import {
  countCases,
  isScenarioKind,
  SURFACE_KIND,
  type AnyCaseRow,
  type ScenarioCaseRow,
  type ScenarioResultRow,
  type ScenarioRunSummary,
  type ScenarioSurface,
} from './scenario-types'
import { isActive, ReportSkeleton, StatusPill, versionNo, type RunRow } from './run-report'
import { evalRequest, GRADED_CASE_LIMIT, type AiSetupError } from './types'

interface Props {
  surface: ScenarioSurface
  exerciseId: number | null
  /** Editor has edits the saved exercise does not have yet; runs always use the saved version. */
  hasUnsavedChanges: boolean
}

interface ScenarioRunRow extends Omit<RunRow, 'summary'> {
  summary: (RunRow['summary'] & { scenario?: ScenarioRunSummary }) | null
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T }

const POLL_MS = 3000
const KNOWN_ERRORS = ['no_cases', 'run_in_progress', 'run_limit', 'case_limit', 'unsupported_type', 'plan_required']

/**
 * Coach ("cheater") or voice-as-text tests of an exercise. Cases and runs are
 * shared with the exercise's other test kinds: one run executes all of them and
 * this panel only shows its own surface.
 */
export function ScenarioTestsPanel({ surface, exerciseId, hasUnsavedChanges }: Props) {
  const t = useTranslations(`dashboard.teacher.aiEvals.scenarios.${surface}`)
  if (exerciseId === null) {
    return (
      <section aria-labelledby={`scenario-${surface}-title`} className="mt-10 space-y-3 border-t pt-8">
        <PanelHeading surface={surface} />
        <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('saveFirst')}</p>
      </section>
    )
  }
  return <SavedScenarioTests surface={surface} exerciseId={exerciseId} hasUnsavedChanges={hasUnsavedChanges} />
}

function PanelHeading({ surface, action }: { surface: ScenarioSurface; action?: React.ReactNode }) {
  const t = useTranslations(`dashboard.teacher.aiEvals.scenarios.${surface}`)
  const Icon = surface === 'voice' ? IconMicrophone : IconFlask
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-64 flex-1 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
          <Icon aria-hidden="true" className="h-5 w-5 text-brand-text" />
        </div>
        <div className="max-w-prose">
          <h3 id={`scenario-${surface}-title`} className="text-base font-semibold tracking-tight">
            {t('title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </div>
      {action && <div className="ms-auto shrink-0">{action}</div>}
    </div>
  )
}

function SavedScenarioTests({ surface, exerciseId, hasUnsavedChanges }: { surface: ScenarioSurface; exerciseId: number; hasUnsavedChanges: boolean }) {
  const t = useTranslations(`dashboard.teacher.aiEvals.scenarios.${surface}`)
  const tc = useTranslations('dashboard.teacher.aiEvals.scenarios.common')
  const base = `/api/teacher/evals/exercise/${exerciseId}`
  const kind = SURFACE_KIND[surface]

  const [unsupported, setUnsupported] = useState(false)
  const [cases, setCases] = useState<Load<AnyCaseRow[]>>({ state: 'loading' })
  const [runs, setRuns] = useState<Load<ScenarioRunRow[]>>({ state: 'loading' })
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Load<{ run: ScenarioRunRow; results: ScenarioResultRow[] }> | null>(null)

  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [confirmRun, setConfirmRun] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiSetupError | null>(null)
  const [dialog, setDialog] = useState<{ item: ScenarioCaseRow | null } | null>(null)
  const [dialogSaving, setDialogSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const loadCases = useCallback(async () => {
    const res = await evalRequest<{ cases: AnyCaseRow[] }>(`${base}/cases`)
    if (res.status === 409 && res.code === 'unsupported_type') return setUnsupported(true)
    if (!res.ok || !res.data) return setCases({ state: 'error' })
    setCases({ state: 'ready', data: res.data.cases ?? [] })
  }, [base])

  const loadRuns = useCallback(async () => {
    const res = await evalRequest<{ runs: ScenarioRunRow[] }>(`${base}/runs`)
    if (res.status === 409 && res.code === 'unsupported_type') {
      setUnsupported(true)
      return
    }
    if (!res.ok || !res.data) return setRuns({ state: 'error' })
    setRuns({ state: 'ready', data: res.data.runs ?? [] })
    return res.data.runs ?? []
  }, [base])

  useEffect(() => {
    // Data fetch on mount: state is only set once the requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCases()
    void loadRuns().then((list) => {
      if (list && list.length > 0) setSelectedRunId((current) => current ?? list[0].id)
    })
  }, [loadCases, loadRuns])

  // The run the user is looking at now: a slow response for another run must not overwrite it.
  const selectedRef = useRef<string | null>(null)
  useEffect(() => {
    selectedRef.current = selectedRunId
  }, [selectedRunId])

  const loadDetail = useCallback(async (runId: string, silent = false) => {
    if (!silent) setDetail({ state: 'loading' })
    const res = await evalRequest<{ run: ScenarioRunRow; results: ScenarioResultRow[] }>(`/api/teacher/evals/runs/${runId}`)
    if (selectedRef.current !== null && selectedRef.current !== runId) return
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

  // Poll while the selected run is going; refresh the history when it ends.
  const activeStatus = detail?.state === 'ready' ? detail.data.run.status : null
  useEffect(() => {
    if (!selectedRunId || (activeStatus !== 'queued' && activeStatus !== 'running')) return
    const timer = setInterval(async () => {
      const run = await loadDetail(selectedRunId, true)
      if (run && !isActive(run)) void loadRuns()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [selectedRunId, activeStatus, loadDetail, loadRuns])

  const allCases = useMemo(() => (cases.state === 'ready' ? cases.data : []), [cases])
  const surfaceCases = useMemo(() => allCases.filter((c) => c.kind === kind) as unknown as ScenarioCaseRow[], [allCases, kind])
  const counts = useMemo(() => countCases(allCases), [allCases])
  const totalCases = allCases.length
  const atLimit = totalCases >= GRADED_CASE_LIMIT
  const runList = runs.state === 'ready' ? runs.data : []
  const runActive = runList.some(isActive) || isActive(detail?.state === 'ready' ? detail.data.run : null)
  const latestRun = runList[0]
  const staleBanner = hasUnsavedChanges && latestRun && !isActive(latestRun)

  const fail = (res: Awaited<ReturnType<typeof evalRequest>>, fallbackKey: string) => {
    if (res.aiError) {
      setAiError(res.aiError)
      return
    }
    if (res.code === 'unsupported_type') setUnsupported(true)
    setError(res.code && KNOWN_ERRORS.includes(res.code) ? tc(`errors.${res.code}`) : tc(fallbackKey))
  }

  const clearErrors = () => {
    setError(null)
    setAiError(null)
  }

  const startRun = async () => {
    setConfirmRun(false)
    clearErrors()
    setStarting(true)
    const res = await evalRequest<{ run: { id: string } }>(`${base}/runs`, { method: 'POST', body: JSON.stringify({}) })
    setStarting(false)
    if (!res.ok || !res.data) return fail(res, 'errors.runFailed')
    await loadRuns()
    setSelectedRunId(res.data.run.id)
  }

  const generate = async () => {
    clearErrors()
    setGenerating(true)
    const res = await evalRequest(`${base}/generate`, { method: 'POST', body: JSON.stringify({ surface }) })
    setGenerating(false)
    if (!res.ok) return fail(res, 'errors.generateFailed')
    await loadCases()
  }

  const deleteCase = async (item: ScenarioCaseRow) => {
    clearErrors()
    setBusy(true)
    const res = await evalRequest(`/api/teacher/evals/cases/${item.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) return fail(res, 'errors.deleteFailed')
    await loadCases()
  }

  const saveDialog = async (patch: ScenarioCasePatch) => {
    if (!dialog) return
    setDialogSaving(true)
    setDialogError(null)
    const editing = dialog.item
    const res = editing
      ? await evalRequest(`/api/teacher/evals/cases/${editing.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      : await evalRequest(`${base}/cases`, { method: 'POST', body: JSON.stringify({ kind, source: 'teacher', ...patch }) })
    setDialogSaving(false)
    if (!res.ok) {
      if (res.code === 'case_limit' || res.code === 'plan_required') return setDialogError(tc(`errors.${res.code}`))
      return setDialogError(tc('errors.saveFailed'))
    }
    setDialog(null)
    await loadCases()
  }

  const detailRun = detail?.state === 'ready' ? detail.data.run : null
  const results = useMemo(() => {
    if (detail?.state !== 'ready') return []
    const byId = new Map(allCases.map((c) => [c.id, (c as { expected?: unknown }).expected]))
    return surfaceResults(detail.data.results, surface).map((r) => ({ ...r, expected: r.expected ?? (r.case_id ? byId.get(r.case_id) : null) ?? null }))
  }, [detail, allCases, surface])
  const stats = useMemo(() => computeStats(results, surface), [results, surface])
  const hasOtherKinds = counts.graded + (surface === 'coach' ? counts.voice : counts.coach) > 0

  if (unsupported) {
    return (
      <section aria-labelledby={`scenario-${surface}-title`} className="mt-10 space-y-3 border-t pt-8">
        <PanelHeading surface={surface} />
        <p role="status" className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
          {tc('errors.unsupported_type')}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby={`scenario-${surface}-title`} className="mt-10 space-y-6 border-t pt-8">
      <PanelHeading
        surface={surface}
        action={
          <div className="flex flex-col items-end gap-1">
            <Button type="button" className="gap-2" onClick={() => setConfirmRun(true)} disabled={totalCases === 0 || runActive || starting}>
              <IconPlayerPlay aria-hidden="true" className="h-4 w-4" />
              {starting ? tc('run.starting') : tc('run.button', { count: totalCases })}
            </Button>
            <p className="max-w-64 text-right text-xs text-muted-foreground">{tc('run.allKinds')}</p>
          </div>
        }
      />

      {surface === 'voice' && (
        <p role="note" className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <IconMicrophone aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {t('textOnlyNote')}
        </p>
      )}

      {hasUnsavedChanges && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
          <IconAlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {staleBanner ? tc('staleBanner') : tc('unsavedBanner')}
        </p>
      )}

      {aiError && <AiErrorNotice code={aiError.code} canConfigure={aiError.canConfigure} settingsUrl={aiError.settingsUrl} audience="teacher" />}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Cases */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose">
            <h4 className="text-sm font-semibold">{t('cases.title', { count: surfaceCases.length })}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('cases.description')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generate} disabled={generating || busy || atLimit}>
              <IconSparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {generating ? tc('cases.generating') : t('cases.generate')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy || atLimit}
              onClick={() => {
                setDialogError(null)
                setDialog({ item: null })
              }}
            >
              <IconPlus aria-hidden="true" className="h-3.5 w-3.5" />
              {t('cases.add')}
            </Button>
          </div>
        </div>
        {atLimit && <p className="text-xs text-muted-foreground">{tc('cases.limitReached', { max: GRADED_CASE_LIMIT })}</p>}
        {cases.state === 'loading' ? (
          <Skeleton className="h-24 rounded-lg" aria-hidden="true" />
        ) : cases.state === 'error' ? (
          <LoadError onRetry={loadCases} />
        ) : surfaceCases.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('cases.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {surfaceCases
              .filter((c) => isScenarioKind(c.kind))
              .map((item) => (
                <ScenarioCaseCard
                  key={item.id}
                  surface={surface}
                  item={item}
                  busy={busy}
                  onDelete={deleteCase}
                  onEdit={(c) => {
                    setDialogError(null)
                    setDialog({ item: c })
                  }}
                />
              ))}
          </ul>
        )}
      </div>

      {/* Latest run report */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">{tc('run.title')}</h4>
          {runList.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {tc('run.history')}
              <select
                value={selectedRunId ?? ''}
                onChange={(e) => setSelectedRunId(e.target.value || null)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {runList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {tc('run.historyItem', { version: versionNo(r as RunRow) ?? '-', date: new Date(r.created_at).toLocaleString() })}
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
              <StatusPill run={detail.data.run as RunRow} />
              {versionNo(detail.data.run as RunRow) != null && <span>{tc('run.version', { version: versionNo(detail.data.run as RunRow) ?? 0 })}</span>}
            </div>
            {detail.data.run.status === 'failed' && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {tc('run.failedReason', { reason: detail.data.run.error ?? tc('run.unknownError') })}
              </p>
            )}
            {isActive(detail.data.run) ? (
              <p role="status" className="text-xs text-muted-foreground">
                {t('run.inProgress')}
              </p>
            ) : detailRun?.status === 'done' && results.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('run.noResultsForSurface')}</p>
            ) : (
              results.length > 0 && <ScenarioLight stats={stats} surface={surface} />
            )}
            {results.length > 0 && (
              <>
                <ScenarioTiles stats={stats} surface={surface} />
                <ScenarioResultsTable results={results} surface={surface} />
              </>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmRun} onOpenChange={setConfirmRun}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('confirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tc('confirm.description', { graded: counts.graded, coach: counts.coach, voice: counts.voice, calls: counts.calls })}
              {hasOtherKinds ? ` ${tc('confirm.allKinds')}` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void startRun()}>{tc('confirm.run')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dialog && (
        <ScenarioCaseDialog
          key={dialog.item?.id ?? 'new'}
          surface={surface}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSave={saveDialog}
          saving={dialogSaving}
          error={dialogError}
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
