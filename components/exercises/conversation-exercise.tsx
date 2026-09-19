'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react'
import { openai } from '@ai-sdk/openai'
import { useTranslations } from 'next-intl'
import confetti from 'canvas-confetti'
import {
  IconAlertTriangle,
  IconLoader2,
  IconMessageCircle,
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
  REALTIME_MODEL,
  type ConversationEvaluation,
  type ConversationTurn,
} from '@/lib/speech/conversation'
import ExerciseBrief from './exercise-brief'
import ExerciseHeader from './exercise-header'
import ExerciseResultSummary from './exercise-result-summary'
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

  const model = useMemo(() => openai.experimental_realtime(REALTIME_MODEL), [])

  // No `sessionConfig` on purpose: instructions, voice and turn detection are
  // embedded in the token by the server, where the student can't edit them.
  const realtime = useRealtime({
    model,
    api: { token: `/api/exercises/realtime/token?exerciseId=${exercise.id}` },
    // Returns nothing on purpose: a tool output would make the tutor speak again.
    // The tool carries no verdict — grading stays on the server.
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === FINISH_CONVERSATION_TOOL) setEndRequested(true)
    },
    onError: (error) => {
      console.error('Realtime error:', error)
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

  const releaseMic = useCallback(() => {
    realtime.stopAudioCapture()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [realtime])

  const start = async () => {
    setErrorMsg(null)
    setMuted(false)
    setEndRequested(false)
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
    setAttemptsUsed((n) => n + 1)
    await realtime.connect()
  }

  // Once the socket is up: open the mic and have the tutor speak first.
  useEffect(() => {
    if (phase !== 'live' || status !== 'connected' || greetedRef.current) return
    greetedRef.current = true
    if (streamRef.current) realtime.startAudioCapture(streamRef.current)
    realtime.requestResponse()
  }, [phase, status, realtime])

  const finish = useCallback(async () => {
    releaseMic()
    realtime.stopPlayback()
    realtime.disconnect()

    if (!turns.some((turn) => turn.role === 'user')) {
      setErrorMsg(t('nothingSaid'))
      setPhase('error')
      return
    }

    setPhase('grading')
    try {
      const res = await fetch('/api/exercises/realtime/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: exercise.id, transcript: turns }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setResult({
        score: data.score,
        passed: data.passed,
        feedback: data.feedback,
        strengths: data.strengths ?? [],
        improvements: data.improvements ?? [],
        corrections: data.corrections ?? [],
        transcript: turns,
        createdAt: new Date().toISOString(),
      })
      setGradedNonce((n) => n + 1)
      setPhase('idle')
      if (data.passed) confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } })
    } catch {
      setErrorMsg(t('gradingError'))
      setPhase('error')
    }
  }, [exercise.id, realtime, releaseMic, t, turns])

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

  // Tutor-initiated ending: let the goodbye finish playing, then grade. The
  // grace period covers the gap between the tool call and the last audio chunk.
  useEffect(() => {
    if (!endRequested || phase !== 'live' || isPlaying) return
    const id = setTimeout(() => void finishRef.current(), 1200)
    return () => clearTimeout(id)
  }, [endRequested, phase, isPlaying])

  // Leaving the page must drop the socket and the mic.
  const releaseRef = useRef(releaseMic)
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
    <div className="space-y-4 lg:space-y-6">
      <ExerciseBrief instructions={exercise.instructions ?? ''} />
      {scenario && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <IconMessageCircle size={16} className="text-brand-text" aria-hidden="true" />
            {t('scenario')}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{scenario}</p>
        </div>
      )}
    </div>
  )

  const taskPanel = (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
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

        {errorMsg && (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {errorMsg}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {phase === 'live' ? (
            <>
              <Button variant="outline" onClick={toggleMute} disabled={status !== 'connected'} aria-pressed={muted}>
                {muted ? (
                  <IconMicrophoneOff size={16} aria-hidden="true" />
                ) : (
                  <IconMicrophone size={16} aria-hidden="true" />
                )}
                {muted ? t('unmute') : t('mute')}
              </Button>
              <Button onClick={() => void finish()} disabled={status !== 'connected'}>
                <IconPhoneOff size={16} aria-hidden="true" />
                {t('finish')}
              </Button>
            </>
          ) : phase === 'grading' ? (
            <Button disabled>
              <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
              {t('grading')}
            </Button>
          ) : (
            <Button onClick={() => void start()} disabled={limitReached}>
              <IconMicrophone size={16} aria-hidden="true" />
              {result || phase === 'error' ? t('startAgain') : t('start')}
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-4 border-t pt-4 text-xs text-muted-foreground">
          <span>{t('maxLength', { minutes: maxMinutes })}</span>
          {!isUnlimited && <span>{t('attemptsToday', { used: attemptsUsed, max: maxDailyAttempts })}</span>}
        </div>
        {limitReached && <p className="mt-2 text-center text-xs text-warning">{t('dailyLimitReached')}</p>}
      </div>

      {(phase === 'live' || phase === 'grading') && (
        <div className="rounded-xl border bg-card">
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

  const resultPanel = result ? (
    <div className="space-y-4">
      <ExerciseResultSummary
        score={result.score}
        passed={result.passed}
        feedback={result.feedback}
        strengths={result.strengths}
        improvements={result.improvements}
        attemptNumber={result.attemptNumber}
        completedAt={result.createdAt}
        passingScore={passingScore}
      />

      {result.corrections.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">{t('corrections')}</h3>
          <ul className="space-y-3">
            {result.corrections.map((c, i) => (
              <li key={i} className="text-sm">
                <p className="text-muted-foreground line-through decoration-destructive/60">{c.said}</p>
                <p className="font-medium">{c.better}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.why}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.transcript.length > 0 && (
        <details className="rounded-xl border bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold">{t('fullTranscript')}</summary>
          <div className="mt-4 space-y-3">
            {result.transcript.map((turn, i) => (
              <Message key={i} from={turn.role}>
                <MessageContent>{turn.text}</MessageContent>
              </Message>
            ))}
          </div>
        </details>
      )}
    </div>
  ) : undefined

  return (
    <div className="space-y-4 sm:space-y-6">
      <ExerciseHeader
        typeLabel={t('title')}
        title={exercise.title}
        description={exercise.description}
        difficulty={exercise.difficulty_level}
        timeLimit={exercise.time_limit}
        completed={isExerciseCompleted || passed === true}
      />

      <ExerciseWorkspace
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
