'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react'
import { openai } from '@ai-sdk/openai'
import { useTranslations } from 'next-intl'
import { nanoid } from 'nanoid'
import {
  IconAlertTriangle,
  IconBulb,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Persona, type PersonaState } from '@/components/ai-elements/persona'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import {
  FINISH_CONVERSATION_TOOL,
  GIVE_HINT_TOOL,
  NOTE_CORRECTION_TOOL,
  REALTIME_MODEL,
  type ConversationEvaluation,
  type ConversationNote,
  type ConversationTurn,
} from '@/lib/speech/conversation'
import ExerciseBrief from './exercise-brief'
import ExerciseHeader from './exercise-header'
import { cn } from '@/lib/utils'
import ExerciseResultSummary from './exercise-result-summary'
import { EXERCISE_SURFACE, ResultSection, RESULT_PROSE } from './result-parts'
import ExerciseWorkspace, { initialWorkspacePanel } from './exercise-workspace'

type Phase = 'idle' | 'live' | 'grading' | 'error'

interface ConversationResult {
  score: number | null
  passed: boolean
  feedback: string | null
  strengths: string[]
  improvements: string[]
  corrections: ConversationEvaluation['corrections']
  transcript: ConversationTurn[]
  attemptNumber?: number | null
  createdAt?: string | null
}

interface ConversationExerciseProps {
  exercise: {
    id: number
    title: string
    description?: string | null
    instructions?: string | null
    difficulty_level?: string | null
    time_limit?: number | null
  }
  scenario: string
  maxMinutes: number
  passingScore: number
  isExerciseCompleted: boolean
  dailyAttemptsUsed: number
  maxDailyAttempts: number
  initialResult: ConversationResult | null
  isExerciseCompletedSection?: React.ReactNode
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ConversationExercise({
  exercise,
  scenario,
  maxMinutes,
  passingScore,
  isExerciseCompleted,
  dailyAttemptsUsed,
  maxDailyAttempts,
  initialResult,
  isExerciseCompletedSection,
}: ConversationExerciseProps) {
  const t = useTranslations('exercises.conversation')
  const tWorkspace = useTranslations('exercises.workspace')

  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(maxMinutes * 60)
  const [result, setResult] = useState<ConversationResult | null>(initialResult)
  const [attemptsUsed, setAttemptsUsed] = useState(dailyAttemptsUsed)
  const [gradedNonce, setGradedNonce] = useState(0)
  // The tutor asked to end the call; we hang up once its goodbye has played.
  const [endRequested, setEndRequested] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const greetedRef = useRef(false)
  const statusRef = useRef<string>('disconnected')
  const releaseRef = useRef<() => void>(() => {})
  // Latest transcript, readable from async code that outlives a render.
  const turnsRef = useRef<ConversationTurn[]>([])

  const model = useMemo(() => openai.experimental_realtime(REALTIME_MODEL), [])
  // One key per mounted tab: the server ties the session to it, so a second
  // tab on the same exercise can't close or grade this one's call. Stable on
  // purpose — the hook rebuilds its store whenever the token URL changes.
  const [tab] = useState(() => nanoid(16))
  // The tutor's latest written hint, and the mistakes it logged for the grader.
  const [hint, setHint] = useState<string | null>(null)
  const notesRef = useRef<ConversationNote[]>([])

  // No `sessionConfig` on purpose: instructions, voice and turn detection are
  // embedded in the token by the server, where the student can't edit them.
  const realtime = useRealtime({
    model,
    api: { token: `/api/exercises/realtime/token?exerciseId=${exercise.id}&tab=${tab}` },
    // No tool carries a verdict — grading stays on the server. Returning a
    // value sends a tool output, which makes the tutor speak again: wanted
    // after a hint (it was asked to call that one BEFORE speaking), not after
    // a goodbye or a logged mistake (those come AFTER it has spoken).
    onToolCall: ({ toolCall }) => {
      const args = (toolCall.args ?? {}) as Record<string, unknown>
      if (toolCall.toolName === FINISH_CONVERSATION_TOOL) setEndRequested(true)
      if (toolCall.toolName === NOTE_CORRECTION_TOOL) {
        if (typeof args.said === 'string' && typeof args.better === 'string') {
          notesRef.current.push({ said: args.said.slice(0, 300), better: args.better.slice(0, 300) })
        }
      }
      if (toolCall.toolName === GIVE_HINT_TOOL) {
        if (typeof args.hint === 'string') setHint(args.hint)
        return { shown: true }
      }
    },
    onError: (error) => {
      console.error('Realtime error:', error)
      // Provider error events mid-call are usually non-fatal (a barge-in
      // truncate landing after the audio ended, a cancel with nothing to
      // cancel). Tearing the UI down while the socket and mic stay open would
      // strand a billed session — only a call that never connected is dead,
      // and a dropped one is handled by the status watcher below.
      if (statusRef.current === 'connected') return
      releaseRef.current()
      setErrorMsg(
        error.message.includes('429')
          ? t('dailyLimitReached')
          : error.message.includes('403')
            ? t('notAvailable')
            : t('connectionError')
      )
      setPhase('error')
    },
  })
  const { status, messages, isPlaying, isCapturing } = realtime
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const turns: ConversationTurn[] = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          text: m.parts
            .map((p) => (p.type === 'text' ? p.text : ''))
            .join('')
            .trim(),
        }))
        .filter((turn) => turn.text.length > 0),
    [messages]
  )
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  const releaseMic = useCallback(() => {
    realtime.stopAudioCapture()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [realtime])

  const start = async () => {
    setErrorMsg(null)
    setMuted(false)
    setEndRequested(false)
    setHint(null)
    notesRef.current = []
    greetedRef.current = false
    setSecondsLeft(maxMinutes * 60)
    // Browsers only expose the microphone on https (or localhost). On plain http
    // there is no permission prompt at all — say so instead of blaming a denial.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg(t('micInsecure'))
      setPhase('error')
      return
    }
    try {
      // Ask for the mic BEFORE minting a session: a denied prompt must not
      // burn one of the student's daily attempts.
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      setErrorMsg(t('micDenied'))
      setPhase('error')
      return
    }
    setPhase('live')
    await realtime.connect()
  }

  // Once the socket is up: open the mic and have the tutor speak first.
  useEffect(() => {
    if (phase !== 'live' || status !== 'connected' || greetedRef.current) return
    greetedRef.current = true
    // Counted here, not on click: a refused token (plan, daily cap) opens no session.
    setAttemptsUsed((n) => n + 1)
    if (streamRef.current) realtime.startAudioCapture(streamRef.current)
    realtime.requestResponse()
  }, [phase, status, realtime])

  const finishingRef = useRef(false)
  const finish = useCallback(async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    releaseMic()
    realtime.stopPlayback()
    setPhase('grading')
    // The transcript of the student's last words arrives AFTER their audio.
    // Hanging up at once graded conversations with the final turn missing.
    if (statusRef.current === 'connected') await new Promise((r) => setTimeout(r, 1500))
    realtime.disconnect()
    const finalTurns = turnsRef.current

    if (!finalTurns.some((turn) => turn.role === 'user')) {
      finishingRef.current = false
      setErrorMsg(t('nothingSaid'))
      setPhase('error')
      return
    }

    try {
      const grade = () =>
        fetch('/api/exercises/realtime/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exerciseId: exercise.id, tab, transcript: finalTurns, notes: notesRef.current }),
        })
      let res = await grade()
      // A grader hiccup must not cost the student the conversation they just
      // had: the route re-opens the session on failure, so one retry is safe.
      if (res.status >= 500) res = await grade()
      if (res.status === 410) {
        setErrorMsg(t('sessionTooLong', { minutes: maxMinutes }))
        setPhase('error')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setResult({
        score: data.score,
        passed: data.passed,
        feedback: data.feedback,
        strengths: data.strengths ?? [],
        improvements: data.improvements ?? [],
        corrections: data.corrections ?? [],
        transcript: finalTurns,
        createdAt: new Date().toISOString(),
      })
      setGradedNonce((n) => n + 1)
      setPhase('idle')
    } catch {
      setErrorMsg(t('gradingError'))
      setPhase('error')
    } finally {
      finishingRef.current = false
    }
  }, [exercise.id, maxMinutes, realtime, releaseMic, t, tab])

  // Countdown — the hard stop that keeps a session inside the teacher's budget.
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  }, [finish])
  useEffect(() => {
    if (phase !== 'live' || status !== 'connected') return
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [phase, status])
  useEffect(() => {
    if (phase === 'live' && secondsLeft === 0) void finishRef.current()
  }, [phase, secondsLeft])

  // The socket dropped mid-call (network, provider session ceiling). Finish is
  // disabled unless connected, so without this the student is stuck on a dead
  // call: grade what was said.
  const wasConnectedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'live') {
      wasConnectedRef.current = false
      return
    }
    if (status === 'connected') wasConnectedRef.current = true
    else if (wasConnectedRef.current && (status === 'disconnected' || status === 'error')) {
      void finishRef.current()
    }
  }, [phase, status])

  // Tutor-initiated ending: let the goodbye finish playing, then grade. The
  // grace period covers the gap between the tool call and the last audio chunk.
  useEffect(() => {
    if (!endRequested || phase !== 'live' || isPlaying) return
    const id = setTimeout(() => void finishRef.current(), 1200)
    return () => clearTimeout(id)
  }, [endRequested, phase, isPlaying])

  // Leaving the page must drop the socket and the mic.
  const disconnectRef = useRef(realtime.disconnect)
  useEffect(() => {
    releaseRef.current = releaseMic
    disconnectRef.current = realtime.disconnect
  }, [releaseMic, realtime.disconnect])
  useEffect(
    () => () => {
      releaseRef.current()
      disconnectRef.current()
    },
    []
  )

  const toggleMute = () => {
    const next = !muted
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  const personaState: PersonaState =
    phase === 'grading' || (phase === 'live' && status === 'connecting')
      ? 'thinking'
      : phase === 'live' && isPlaying
        ? 'speaking'
        : phase === 'live' && isCapturing && !muted
          ? 'listening'
          : phase === 'live'
            ? 'idle'
            : 'asleep'

  const statusLabel =
    phase === 'grading'
      ? t('grading')
      : phase === 'live' && status === 'connecting'
        ? t('connecting')
        : personaState === 'speaking'
          ? t('tutorSpeaking')
          : endRequested
            ? t('wrappingUp')
            : personaState === 'listening'
            ? t('listening')
            : phase === 'live' && muted
              ? t('muted')
              : t('ready')

  const passed = result?.passed ?? (isExerciseCompleted ? true : undefined)
  const isUnlimited = maxDailyAttempts <= 0
  const limitReached = !isUnlimited && attemptsUsed >= maxDailyAttempts && phase !== 'live'

  const briefPanel = (
    <div className="space-y-5">
      <ExerciseBrief instructions={exercise.instructions ?? ''} />
      {scenario && (
        <div className="border-t pt-5">
          <h2 className="mb-2 text-sm font-semibold">{t('scenario')}</h2>
          <p className="max-w-[68ch] text-base leading-relaxed text-foreground/85">{scenario}</p>
        </div>
      )}
    </div>
  )

  const showResult = Boolean(result) && phase !== 'live' && phase !== 'grading'
  // One alert, next to the button the student will press next.
  const retryInResult = showResult && !limitReached

  const errorAlert = errorMsg && (
    <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
      <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      {errorMsg}
    </p>
  )

  const taskPanel = (
    <div className="space-y-4">
      <div className={EXERCISE_SURFACE}>
        <div className="flex flex-col items-center gap-3">
          <Persona state={personaState} variant="halo" className="size-40" />
          <p className="text-sm font-medium" role="status" aria-live="polite">
            {statusLabel}
          </p>
          {phase === 'live' && status === 'connected' && (
            <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-label={t('timeLeft')}>
              {formatClock(secondsLeft)}
            </p>
          )}
        </div>

        {/* On a phone the alert rides with the result tab's retry button. */}
        {errorMsg && <div className={cn('mt-4', retryInResult && 'hidden lg:block')}>{errorAlert}</div>}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {phase === 'live' ? (
            <>
              <Button variant="outline" size="lg" className="h-11 text-sm" onClick={toggleMute} disabled={status !== 'connected'} aria-pressed={muted}>
                {muted ? (
                  <IconMicrophoneOff size={16} aria-hidden="true" />
                ) : (
                  <IconMicrophone size={16} aria-hidden="true" />
                )}
                {muted ? t('unmute') : t('mute')}
              </Button>
              <Button size="lg" className="h-11 text-sm" onClick={() => void finish()} disabled={status !== 'connected'}>
                <IconPhoneOff size={16} aria-hidden="true" />
                {t('finish')}
              </Button>
            </>
          ) : phase === 'grading' ? (
            <Button disabled size="lg" className="h-11 text-sm">
              <IconLoader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t('grading')}
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-11 text-sm"
              onClick={() => void start()}
              disabled={limitReached}
            >
              <IconMicrophone size={16} aria-hidden="true" />
              {result || phase === 'error' ? t('startAgain') : t('start')}
            </Button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
          <span>{t('maxLength', { minutes: maxMinutes })}</span>
          {!isUnlimited && <span>{t('attemptsToday', { used: attemptsUsed, max: maxDailyAttempts })}</span>}
        </div>
        {limitReached && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-warning">
            <IconAlertTriangle size={14} aria-hidden="true" />
            {t('dailyLimitReached')}
          </p>
        )}
      </div>

      {phase === 'live' && hint && (
        // The tutor keeps speaking the practised language; the hint is the one
        // thing on this screen in the student's own.
        <div className="flex items-start gap-2.5 rounded-lg bg-brand-tint px-4 py-3 text-sm" role="status">
          <IconBulb size={16} className="mt-0.5 shrink-0 text-brand-text" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{t('hint')}</p>
            <p>{hint}</p>
          </div>
        </div>
      )}

      {(phase === 'live' || phase === 'grading') && (
        <div className="rounded-card bg-card ring-1 ring-foreground/10">
          <h3 className="border-b px-5 py-3 text-sm font-semibold">{t('liveTranscript')}</h3>
          <Conversation className="h-72">
            <ConversationContent>
              {turns.length === 0 ? (
                <ConversationEmptyState title={t('transcriptEmptyTitle')} description={t('transcriptEmpty')} />
              ) : (
                turns.map((turn, i) => (
                  <Message key={i} from={turn.role}>
                    <MessageContent>{turn.text}</MessageContent>
                  </Message>
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
      )}
    </div>
  )

  // Hidden during a call: on desktop the result sits above the task, which
  // pushed the live call below the fold, and on a phone its absence is what
  // moves the student from the result tab to the call.
  const resultPanel = result && showResult ? (
    <div className="space-y-4">
      {/* Phone only, where the call is a tab away. From `lg` up the call panel
          sits right above this one and carries the button. */}
      {retryInResult && (
        <div className="space-y-3 lg:hidden">
          {errorAlert}
          <Button size="lg" onClick={() => void start()} className="h-11 w-full text-sm sm:w-auto sm:px-6">
            <IconMicrophone size={16} aria-hidden="true" />
            {t('startAgain')}
          </Button>
        </div>
      )}

      <ExerciseResultSummary
        score={result.score}
        passed={result.passed}
        feedback={result.feedback}
        strengths={result.strengths}
        improvements={result.improvements}
        attemptNumber={result.attemptNumber}
        completedAt={result.createdAt}
        passingScore={passingScore}
      >
        {result.corrections.length > 0 && (
          <ResultSection title={t('corrections')}>
            <ul className="space-y-3">
              {result.corrections.map((c, i) => (
                <li key={i} className={cn('text-sm', RESULT_PROSE)}>
                  <p className="text-muted-foreground line-through decoration-destructive/60">{c.said}</p>
                  <p className="font-medium">{c.better}</p>
                  <p className="mt-0.5 text-muted-foreground">{c.why}</p>
                </li>
              ))}
            </ul>
          </ResultSection>
        )}

        {result.transcript.length > 0 && (
          <ResultSection>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">{t('fullTranscript')}</summary>
              <div className="mt-4 space-y-3">
                {result.transcript.map((turn, i) => (
                  <Message key={i} from={turn.role}>
                    <MessageContent>{turn.text}</MessageContent>
                  </Message>
                ))}
              </div>
            </details>
          </ResultSection>
        )}
      </ExerciseResultSummary>
    </div>
  ) : undefined

  return (
    <div className="lg:h-full">
      <ExerciseWorkspace
        header={
          <ExerciseHeader
            typeLabel={t('title')}
            title={exercise.title}
            description={exercise.description}
            difficulty={exercise.difficulty_level}
            timeLimit={exercise.time_limit}
            completed={isExerciseCompleted || passed === true}
          />
        }
        brief={briefPanel}
        task={taskPanel}
        taskLabel={tWorkspace('speak')}
        result={resultPanel}
        resultPassed={passed}
        related={isExerciseCompletedSection}
        initialPanel={initialWorkspacePanel({
          hasResult: Boolean(resultPanel),
          passed,
          attempted: Boolean(initialResult),
        })}
        revealResultNonce={gradedNonce}
      />
    </div>
  )
}
