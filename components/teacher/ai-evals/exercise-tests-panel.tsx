'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle, IconFlask, IconPlayerPlay, IconPlus, IconSparkles } from '@tabler/icons-react'
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
import { GradedCaseCard, GradedCaseDialog, type GradedCasePatch } from './graded-case-cards'
import {
  GradedResultsTable,
  GradedSummaryTiles,
  TrafficLight,
  type GradedRunRow,
} from './graded-run-report'
import { countCases, type AnyCaseRow } from './scenario-types'
import { isActive, ReportSkeleton, StatusPill, versionNo } from './run-report'
import {
  GRADED_CASES_CHANGED_EVENT,
  GRADED_CASE_LIMIT,
  GRADED_REPEATS,
  evalRequest,
  type AiSetupError,
  type GradedCaseRow,
  type GradedRunResult,
} from './types'

export type EvalTarget = { kind: 'exercise' | 'checkpoint'; id: number }

interface Props {
  exerciseId: number | null
  /** Editor has edits the saved exercise does not have yet; runs always use the saved version. */
  hasUnsavedChanges: boolean
  /** Used only to label pass/fail reasons; the server derives the real value. */
  passingScore?: number
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T }

const POLL_MS = 3000

export function ExerciseTestsPanel({ exerciseId, hasUnsavedChanges }: Props) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded')

  if (exerciseId === null) {
    return (
      <section aria-labelledby="graded-evals-title" className="mt-10 space-y-3 border-t pt-8">
        <PanelHeading kind="exercise" />
        <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('saveFirst')}</p>
      </section>
    )
  }
  return <SavedTests target={{ kind: 'exercise', id: exerciseId }} hasUnsavedChanges={hasUnsavedChanges} />
}

/**
 * Grading tests for a lesson checkpoint. Checkpoint edits save immediately, so there is no
 * "unsaved changes" state. Meant to live inside a dialog (`embedded`).
 */
export function CheckpointTestsPanel({ checkpointId }: { checkpointId: number }) {
  return <SavedTests target={{ kind: 'checkpoint', id: checkpointId }} hasUnsavedChanges={false} embedded />
}

function PanelHeading({ action, kind, embedded }: { action?: React.ReactNode; kind: EvalTarget['kind']; embedded?: boolean }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded')
  const p = kind === 'checkpoint' ? 'checkpoint.' : ''
  const Heading = embedded ? 'h2' : 'h3'
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-64 flex-1 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
          <IconFlask aria-hidden="true" className="h-5 w-5 text-brand-text" />
        </div>
        <div className="max-w-prose">
          <Heading id="graded-evals-title" className="text-base font-semibold tracking-tight">
            {t(`${p}title`)}
          </Heading>
          <p className="text-sm text-muted-foreground">{t(`${p}description`)}</p>
        </div>
      </div>
      {action && <div className="ms-auto shrink-0">{action}</div>}
    </div>
  )
}

function SavedTests({ target, hasUnsavedChanges, embedded = false }: { target: EvalTarget; hasUnsavedChanges: boolean; embedded?: boolean }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded')
  const kind = target.kind
  const base = `/api/teacher/evals/${kind}/${target.id}`
  const sectionClass = embedded ? 'space-y-6' : 'mt-10 space-y-6 border-t pt-8'
  const [unsupported, setUnsupported] = useState(false)

  const [cases, setCases] = useState<Load<GradedCaseRow[]>>({ state: 'loading' })
  const [runs, setRuns] = useState<Load<GradedRunRow[]>>({ state: 'loading' })
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Load<{ run: GradedRunRow; results: GradedRunResult[] }> | null>(null)

  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [confirmRun, setConfirmRun] = useState(false)
  // Every case kind of the exercise (a run executes all of them), fetched when the confirm opens.
  const [allCases, setAllCases] = useState<AnyCaseRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiSetupError | null>(null)
  const [dialog, setDialog] = useState<{ item: GradedCaseRow | null } | null>(null)
  const [dialogSaving, setDialogSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const loadCases = useCallback(async () => {
    const res = await evalRequest<{ cases: GradedCaseRow[] }>(`${base}/cases?kind=graded_answer`)
    if (res.status === 409 && res.code === 'unsupported_type') return setUnsupported(true)
    if (!res.ok || !res.data) return setCases({ state: 'error' })
    setCases({ state: 'ready', data: res.data.cases ?? [] })
  }, [base])

  const loadRuns = useCallback(async () => {
    const res = await evalRequest<{ runs: GradedRunRow[] }>(`${base}/runs`)
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

  // A golden saved from the preview modal lands here without a page reload.
  useEffect(() => {
    const onChanged = () => void loadCases()
    window.addEventListener(GRADED_CASES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(GRADED_CASES_CHANGED_EVENT, onChanged)
  }, [loadCases])

  // The run the user is looking at now: a slow response for another run must not overwrite it.
  const selectedRef = useRef<string | null>(null)
  useEffect(() => {
    selectedRef.current = selectedRunId
  }, [selectedRunId])

  const loadDetail = useCallback(async (runId: string, silent = false) => {
    if (!silent) setDetail({ state: 'loading' })
    const res = await evalRequest<{ run: GradedRunRow; results: GradedRunResult[] }>(`/api/teacher/evals/runs/${runId}`)
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

  const caseList = cases.state === 'ready' ? cases.data : []
  const runList = runs.state === 'ready' ? runs.data : []
  const runActive = runList.some(isActive) || isActive(detail?.state === 'ready' ? detail.data.run : null)
  const caseCount = caseList.length
  const atLimit = caseCount >= GRADED_CASE_LIMIT
  const totals = allCases ? countCases(allCases) : null
  const estimate = totals ? totals.calls : caseCount * GRADED_REPEATS
  const otherKinds = totals ? totals.coach + totals.voice : 0

  const openConfirm = async () => {
    setAllCases(null)
    setConfirmRun(true)
    if (kind !== 'exercise') return
    const res = await evalRequest<{ cases: AnyCaseRow[] }>(`${base}/cases`)
    if (res.ok && res.data) setAllCases(res.data.cases ?? [])
  }

  const fail = (res: Awaited<ReturnType<typeof evalRequest>>, fallbackKey: string) => {
    if (res.aiError) {
      setAiError(res.aiError)
      return
    }
    const known = ['no_cases', 'run_in_progress', 'run_limit', 'case_limit', 'unsupported_type']
    if (res.code === 'unsupported_type') setUnsupported(true)
    const override = kind === 'checkpoint' && res.code && ['run_in_progress', 'case_limit', 'unsupported_type'].includes(res.code)
    setError(res.code && known.includes(res.code) ? t(override ? `checkpoint.errors.${res.code}` : `errors.${res.code}`) : t(fallbackKey))
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
    const res = await evalRequest(`${base}/generate`, { method: 'POST', body: JSON.stringify({}) })
    setGenerating(false)
    if (!res.ok) return fail(res, 'errors.generateFailed')
    await loadCases()
  }

  const deleteCase = async (item: GradedCaseRow) => {
    clearErrors()
    setBusy(true)
    const res = await evalRequest(`/api/teacher/evals/cases/${item.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) return fail(res, 'errors.deleteFailed')
    await loadCases()
  }

  const saveDialog = async (patch: GradedCasePatch) => {
    if (!dialog) return
    setDialogSaving(true)
    setDialogError(null)
    const editing = dialog.item
    const res = editing
      ? await evalRequest(`/api/teacher/evals/cases/${editing.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      : await evalRequest(`${base}/cases`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'graded_answer', source: 'teacher', ...patch, expected: { ...patch.expected, category: 'custom' } }),
        })
    setDialogSaving(false)
    if (!res.ok) return setDialogError(res.code === 'case_limit' ? t(kind === 'checkpoint' ? 'checkpoint.errors.case_limit' : 'errors.case_limit') : t('errors.saveFailed'))
    setDialog(null)
    await loadCases()
  }

  const detailRun = detail?.state === 'ready' ? detail.data.run : null
  const results =
    detail?.state === 'ready'
      ? detail.data.results
          .filter((r) => !r.case_kind || r.case_kind === 'graded_answer')
          .map((r) => ({ ...r, expected: r.expected ?? caseList.find((c) => c.id === r.case_id)?.expected ?? null }))
      : []
  const latestRun = runList[0]
  const staleBanner = hasUnsavedChanges && latestRun && !isActive(latestRun)

  if (unsupported) {
    return (
      <section aria-labelledby="graded-evals-title" className={embedded ? 'space-y-3' : 'mt-10 space-y-3 border-t pt-8'}>
        <PanelHeading kind={kind} embedded={embedded} />
        <p role="status" className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
          {t(kind === 'checkpoint' ? 'checkpoint.unsupported' : 'errors.unsupported_type')}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="graded-evals-title" className={sectionClass}>
      <PanelHeading
        kind={kind}
        embedded={embedded}
        action={
          <div className="flex flex-col items-end gap-1">
            <Button type="button" className="gap-2" onClick={() => void openConfirm()} disabled={caseCount === 0 || runActive || starting}>
              <IconPlayerPlay aria-hidden="true" className="h-4 w-4" />
              {starting ? t('run.starting') : t('run.button', { count: caseCount })}
            </Button>
            <p className="text-xs text-muted-foreground">{t('run.byok')}</p>
          </div>
        }
      />

      {hasUnsavedChanges && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
          <IconAlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {staleBanner ? t('staleBanner') : t('unsavedBanner')}
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
            <h4 className="text-sm font-semibold">{t('cases.title', { count: caseCount, max: GRADED_CASE_LIMIT })}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('cases.description')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generate} disabled={generating || busy || atLimit}>
              <IconSparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {generating ? t('cases.generating') : t('cases.generate')}
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
        {atLimit && <p className="text-xs text-muted-foreground">{t('cases.limitReached')}</p>}
        {cases.state === 'loading' ? (
          <Skeleton className="h-24 rounded-lg" aria-hidden="true" />
        ) : cases.state === 'error' ? (
          <LoadError onRetry={loadCases} />
        ) : caseList.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('cases.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {caseList.map((item) => (
              <GradedCaseCard
                key={item.id}
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
                    {t('run.historyItem', { version: versionNo(r) ?? '-', date: new Date(r.created_at).toLocaleString() })}
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
            {isActive(detail.data.run) ? (
              <p className="text-xs text-muted-foreground">{t('run.inProgress')}</p>
            ) : detailRun?.status === 'done' && results.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{t('run.noResults')}</p>
            ) : (
              detailRun?.status === 'done' && <TrafficLight summary={detailRun.summary} />
            )}
            {(results.length > 0 || isActive(detail.data.run)) && <GradedSummaryTiles summary={detail.data.run.summary} />}
            {results.length > 0 && <GradedResultsTable results={results} nextStep={kind === 'checkpoint'} />}
          </div>
        )}
      </div>

      <AlertDialog open={confirmRun} onOpenChange={setConfirmRun}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {otherKinds > 0
                ? t('confirm.descriptionAll', { cases: totals?.graded ?? caseCount, coach: totals?.coach ?? 0, voice: totals?.voice ?? 0, calls: estimate })
                : t('confirm.description', { cases: caseCount, repeats: GRADED_REPEATS, calls: estimate })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void startRun()}>{t('confirm.run')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dialog && (
        <GradedCaseDialog
          key={dialog.item?.id ?? 'new'}
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
