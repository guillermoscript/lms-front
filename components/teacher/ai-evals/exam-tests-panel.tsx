'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconAlertTriangle, IconFlask, IconLock, IconPencil, IconPlayerPlay, IconPlus, IconSparkles } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
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
import { DeleteButton } from './case-cards'
import { ExamCaseDialog } from './exam-case-editor'
import { ExamResultsTable, ExamTrafficLight } from './exam-run-report'
import { GradedSummaryTiles, type GradedRunRow } from './graded-run-report'
import { isActive, ReportSkeleton, StatusPill, versionNo } from './run-report'
import { GRADED_CASE_LIMIT } from './types'
import {
  EXAM_CASES_CHANGED_EVENT,
  GRADED_REPEATS,
  evalRequest,
  type AiSetupError,
  type ExamCasePatch,
  type ExamCaseRow,
  type ExamQuestionInfo,
  type ExamRunResult,
  type ExamRunSummary,
} from './exam-types'

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T }
type ExamRunRow = Omit<GradedRunRow, 'summary'> & { summary: ExamRunSummary | null }

const POLL_MS = 3000
const KNOWN_ERRORS = ['no_cases', 'run_in_progress', 'run_limit', 'case_limit', 'no_ai_questions', 'unknown_question', 'plan_required']

interface Props {
  examId: number
  questions: ExamQuestionInfo[]
  /** The builder has edits the saved exam does not have yet; runs always use the saved exam. */
  hasUnsavedChanges: boolean
}

function Heading() {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.exam')
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
        <IconFlask aria-hidden="true" className="h-5 w-5 text-brand-text" />
      </div>
      <div className="max-w-prose">
        <h2 id="exam-evals-title" className="text-base font-semibold tracking-tight">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
    </div>
  )
}

function Notice({ children, icon }: { children: React.ReactNode; icon?: 'lock' }) {
  const Icon = icon === 'lock' ? IconLock : IconAlertTriangle
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
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

function ExamCaseCard({
  item,
  questions,
  busy,
  onEdit,
  onDelete,
}: {
  item: ExamCaseRow
  questions: ExamQuestionInfo[]
  busy: boolean
  onEdit: (item: ExamCaseRow) => void
  onDelete: (item: ExamCaseRow) => void
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.exam.cases')
  const unverified = (item.source === 'generated' || item.source === 'preview') && !item.teacher_edited
  const category = item.expected?.category
  const firstWritten = questions.find((q) => q.type === 'free_text' && (item.input?.answers?.[q.id] ?? '') !== '')
  const snippet = firstWritten ? item.input.answers[firstWritten.id] : ''
  const written = Object.keys(item.expected?.questions ?? {}).length
  return (
    <li className="rounded-lg border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium">{item.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {category && (
              <Badge variant={category === 'injection' ? 'outline' : 'secondary'}>
                {t.has(`categories.${category}`) ? t(`categories.${category}`) : category}
              </Badge>
            )}
            <Badge variant="outline">{t(`source.${item.source}`)}</Badge>
            {unverified && (
              <Badge variant="outline" className="border-warning/40 text-warning">
                {t('unverified')}
              </Badge>
            )}
            {item.teacher_edited && <Badge variant="secondary">{t('editedByYou')}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('editAria', { name: item.name })} disabled={busy} onClick={() => onEdit(item)}>
            <IconPencil aria-hidden="true" className="h-4 w-4" />
          </Button>
          <DeleteButton name={item.name} disabled={busy} onConfirm={() => onDelete(item)} />
        </div>
      </div>
      {snippet && (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-md bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">{snippet}</p>
      )}
      {item.importance_note && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t('whyItMatters')}: </span>
          {item.importance_note}
        </p>
      )}
      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
        {t('summary', { count: written, tolerance: item.expected?.total_tolerance ?? 10 })}
      </p>
    </li>
  )
}

export function ExamTestsPanel({ examId, questions, hasUnsavedChanges }: Props) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded')
  const te = useTranslations('dashboard.teacher.aiEvals.graded.exam')
  const locale = useLocale()
  const base = `/api/teacher/evals/exam/${examId}`
  const hasWritten = questions.some((q) => q.type === 'free_text')

  const [planRequired, setPlanRequired] = useState(false)
  const [noAiQuestions, setNoAiQuestions] = useState(false)
  const [cases, setCases] = useState<Load<ExamCaseRow[]>>({ state: 'loading' })
  const [runs, setRuns] = useState<Load<ExamRunRow[]>>({ state: 'loading' })
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Load<{ run: ExamRunRow; results: ExamRunResult[] }> | null>(null)

  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [confirmRun, setConfirmRun] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiSetupError | null>(null)
  const [dialog, setDialog] = useState<{ item: ExamCaseRow | null } | null>(null)
  const [dialogSaving, setDialogSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const loadCases = useCallback(async () => {
    const res = await evalRequest<{ cases: ExamCaseRow[] }>(`${base}/cases`)
    if (res.code === 'plan_required') return setPlanRequired(true)
    if (!res.ok || !res.data) return setCases({ state: 'error' })
    setCases({ state: 'ready', data: res.data.cases ?? [] })
  }, [base])

  const loadRuns = useCallback(async () => {
    const res = await evalRequest<{ runs: ExamRunRow[] }>(`${base}/runs`)
    if (res.code === 'plan_required') return setPlanRequired(true)
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

  useEffect(() => {
    const onChanged = () => void loadCases()
    window.addEventListener(EXAM_CASES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(EXAM_CASES_CHANGED_EVENT, onChanged)
  }, [loadCases])

  // The run the user is looking at now: a slow response for another run must not overwrite it.
  const selectedRef = useRef<string | null>(null)
  useEffect(() => {
    selectedRef.current = selectedRunId
  }, [selectedRunId])

  const loadDetail = useCallback(async (runId: string, silent = false) => {
    if (!silent) setDetail({ state: 'loading' })
    const res = await evalRequest<{ run: ExamRunRow; results: ExamRunResult[] }>(`/api/teacher/evals/runs/${runId}`)
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
  const writtenCount = questions.filter((q) => q.type === 'free_text').length
  const canRun = hasWritten && !noAiQuestions

  const fail = (res: Awaited<ReturnType<typeof evalRequest>>, fallbackKey: string) => {
    if (res.aiError) return setAiError(res.aiError)
    if (res.code === 'plan_required') return setPlanRequired(true)
    if (res.code === 'no_ai_questions') setNoAiQuestions(true)
    setError(res.code && KNOWN_ERRORS.includes(res.code) ? te(`errors.${res.code}`) : t(fallbackKey))
  }

  const clearErrors = () => {
    setError(null)
    setAiError(null)
  }

  const startRun = async () => {
    setConfirmRun(false)
    clearErrors()
    setStarting(true)
    const res = await evalRequest<{ run_id?: string; run?: { id: string } }>(`${base}/runs`, { method: 'POST', body: JSON.stringify({ locale: locale === 'es' ? 'es' : 'en' }) })
    setStarting(false)
    const runId = res.data?.run_id ?? res.data?.run?.id
    if (!res.ok || !runId) return fail(res, 'errors.runFailed')
    await loadRuns()
    setSelectedRunId(runId)
  }

  const generate = async () => {
    clearErrors()
    setGenerating(true)
    const res = await evalRequest(`${base}/generate`, { method: 'POST', body: JSON.stringify({}) })
    setGenerating(false)
    if (!res.ok) return fail(res, 'errors.generateFailed')
    await loadCases()
  }

  const deleteCase = async (item: ExamCaseRow) => {
    clearErrors()
    setBusy(true)
    const res = await evalRequest(`/api/teacher/evals/cases/${item.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) return fail(res, 'errors.deleteFailed')
    await loadCases()
  }

  const saveDialog = async (patch: ExamCasePatch, meta: { source: 'teacher' | 'preview' }) => {
    if (!dialog) return
    setDialogSaving(true)
    setDialogError(null)
    const editing = dialog.item
    const res = editing
      ? await evalRequest(`/api/teacher/evals/cases/${editing.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      : await evalRequest(`${base}/cases`, {
          method: 'POST',
          body: JSON.stringify({
            kind: 'graded_exam',
            source: meta.source,
            ...patch,
            expected: { ...patch.expected, category: 'custom' },
          }),
        })
    setDialogSaving(false)
    if (!res.ok) {
      if (res.code === 'plan_required') {
        setDialog(null)
        return setPlanRequired(true)
      }
      return setDialogError(res.code && KNOWN_ERRORS.includes(res.code) ? te(`errors.${res.code}`) : t('errors.saveFailed'))
    }
    setDialog(null)
    await loadCases()
  }

  const detailRun = detail?.state === 'ready' ? detail.data.run : null
  const results = detail?.state === 'ready' ? detail.data.results : []
  const staleBanner = hasUnsavedChanges && runList[0] && !isActive(runList[0])

  if (planRequired) {
    return (
      <section aria-labelledby="exam-evals-title" className="space-y-3">
        <Heading />
        <Notice icon="lock">{te('errors.plan_required')}</Notice>
      </section>
    )
  }

  return (
    <section aria-labelledby="exam-evals-title" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading />
        <div className="flex flex-col items-end gap-1">
          <Button type="button" className="gap-2" onClick={() => setConfirmRun(true)} disabled={caseCount === 0 || runActive || starting || !canRun}>
            <IconPlayerPlay aria-hidden="true" className="h-4 w-4" />
            {starting ? t('run.starting') : t('run.button', { count: caseCount })}
          </Button>
          <p className="text-xs text-muted-foreground">{t('run.byok')}</p>
        </div>
      </div>

      {hasUnsavedChanges && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
          <IconAlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {staleBanner ? te('staleBanner') : te('unsavedBanner')}
        </p>
      )}

      {!canRun && <Notice>{te('errors.no_ai_questions')}</Notice>}

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
            <h3 className="text-sm font-semibold">{te('cases.title', { count: caseCount, max: GRADED_CASE_LIMIT })}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{te('cases.description', { written: writtenCount })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={generate} disabled={generating || busy || atLimit || !canRun}>
              <IconSparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {generating ? t('cases.generating') : te('cases.generate')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy || atLimit || !canRun}
              onClick={() => {
                setDialogError(null)
                setDialog({ item: null })
              }}
            >
              <IconPlus aria-hidden="true" className="h-3.5 w-3.5" />
              {te('cases.add')}
            </Button>
          </div>
        </div>
        {atLimit && <p className="text-xs text-muted-foreground">{t('cases.limitReached')}</p>}
        {cases.state === 'loading' ? (
          <Skeleton className="h-24 rounded-lg" aria-hidden="true" />
        ) : cases.state === 'error' ? (
          <LoadError onRetry={loadCases} />
        ) : caseList.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{te('cases.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {caseList.map((item) => (
              <ExamCaseCard
                key={item.id}
                item={item}
                questions={questions}
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
          <h3 className="text-sm font-semibold">{t('run.title')}</h3>
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
                    {t('run.historyItem', { version: versionNo(r as never) ?? '-', date: new Date(r.created_at).toLocaleString() })}
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
          <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">{te('run.empty')}</p>
        ) : detail.state === 'error' ? (
          <LoadError onRetry={() => selectedRunId && loadDetail(selectedRunId)} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusPill run={detail.data.run} />
              {versionNo(detail.data.run as never) != null && <span>{te('run.version', { version: versionNo(detail.data.run as never) ?? 0 })}</span>}
            </div>
            {detail.data.run.status === 'failed' && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {t('run.failedReason', { reason: detail.data.run.error ?? t('run.unknownError') })}
              </p>
            )}
            {isActive(detail.data.run) ? (
              <p className="text-xs text-muted-foreground">{t('run.inProgress')}</p>
            ) : (
              detailRun?.status === 'done' && <ExamTrafficLight summary={detailRun.summary} />
            )}
            <GradedSummaryTiles summary={detail.data.run.summary} />
            {results.length > 0 && <ExamResultsTable results={results} questions={questions} />}
          </div>
        )}
      </div>

      <AlertDialog open={confirmRun} onOpenChange={setConfirmRun}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {te('confirm.description', { cases: caseCount, repeats: GRADED_REPEATS, calls: caseCount * GRADED_REPEATS })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void startRun()}>{t('confirm.run')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dialog && (
        <ExamCaseDialog
          key={dialog.item?.id ?? 'new'}
          examId={examId}
          questions={questions}
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
