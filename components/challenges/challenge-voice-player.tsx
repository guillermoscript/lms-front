'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react'
import { useTranslations } from 'next-intl'
import { nanoid } from 'nanoid'
import { IconAlertTriangle, IconBulb, IconLoader2, IconMicrophone, IconMicrophoneOff, IconPhoneOff } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Persona, type PersonaState } from '@/components/ai-elements/persona'
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { FINISH_CONVERSATION_TOOL, GIVE_HINT_TOOL, type ConversationTurn } from '@/lib/speech/conversation'
import { createLateBoundRealtimeModel, observeRealtimeSetup } from '@/lib/speech/realtime-model'
import type { AttemptResult } from './challenge-player'

type Phase = 'idle' | 'live' | 'grading' | 'error'

const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

/**
 * The voice reto player (members only): one live call with the school's tutor,
 * graded ONCE from the final transcript through `/api/reto/attempt`. Same call
 * lifecycle as `ConversationExercise`, minus its workspace chrome, daily
 * counter and mistake log: a reto is graded cold, so the tutor's logged
 * mistakes (browser-reported) are not sent, and the tutor's hint tool is
 * acknowledged but nothing is shown (no hints).
 */
export function ChallengeVoicePlayer({ token, maxMinutes, onResult }: { token: string; maxMinutes: number; onResult: (result: AttemptResult) => void }) {
  const t = useTranslations('exercises.conversation')
  const tp = useTranslations('challenges.page')
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(maxMinutes * 60)
  const [endRequested, setEndRequested] = useState(false)
  const [tab] = useState(() => nanoid(16))

  const streamRef = useRef<MediaStream | null>(null)
  const greetedRef = useRef(false)
  const statusRef = useRef('disconnected')
  const releaseRef = useRef<() => void>(() => {})
  const turnsRef = useRef<ConversationTurn[]>([])
  const setupFailureRef = useRef<{ status: number; body: string } | null>(null)
  const lateModel = useMemo(() => createLateBoundRealtimeModel(), [])
  const tokenEndpoint = `/api/reto/realtime/token?token=${encodeURIComponent(token)}&tab=${tab}`

  const realtime = useRealtime({
    model: lateModel.model,
    api: { token: tokenEndpoint },
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === FINISH_CONVERSATION_TOOL) setEndRequested(true)
      // Cold attempt: acknowledge the tool so the tutor carries on, show nothing.
      if (toolCall.toolName === GIVE_HINT_TOOL) return { shown: false }
    },
    onError: (error) => {
      console.error('Realtime error:', error)
      if (statusRef.current === 'connected') return
      releaseRef.current()
      const failure = setupFailureRef.current
      setupFailureRef.current = null
      const status = failure ? String(failure.status) : error.message
      setErrorMsg(status.includes('429') ? tp('errorRateLimited') : status.includes('403') || status.includes('401') ? t('notAvailable') : t('connectionError'))
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
        .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('').trim() }))
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
    setupFailureRef.current = null
    setMuted(false)
    setEndRequested(false)
    greetedRef.current = false
    setSecondsLeft(maxMinutes * 60)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg(t('micInsecure'))
      setPhase('error')
      return
    }
    try {
      // The mic first: a denied prompt must not mint (and bill) a session.
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setErrorMsg(t('micDenied'))
      setPhase('error')
      return
    }
    setPhase('live')
    const stopObserving = observeRealtimeSetup(tokenEndpoint, {
      onDescriptor: (descriptor) => lateModel.bind(descriptor),
      onFailure: (failStatus, body) => {
        setupFailureRef.current = { status: failStatus, body }
      },
    })
    try {
      await realtime.connect()
    } finally {
      stopObserving()
    }
  }

  useEffect(() => {
    if (phase !== 'live' || status !== 'connected' || greetedRef.current) return
    greetedRef.current = true
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
        fetch('/api/reto/attempt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ token, tab, transcript: finalTurns }),
        })
      let res = await grade()
      // The server re-opens the session when the grader fails, so one retry is safe.
      if (res.status >= 500) res = await grade()
      const body = await res.json().catch(() => null)
      if (res.status === 429) setErrorMsg(tp('errorRateLimited'))
      else if (res.status === 402 || res.status === 503) setErrorMsg(tp('errorPaused'))
      else if (res.status === 410) setErrorMsg(t('sessionTooLong', { minutes: maxMinutes }))
      else if (!res.ok || typeof body?.score !== 'number') setErrorMsg(t('gradingError'))
      else {
        onResult({ score: body.score, passed: Boolean(body.passed), feedback: body.feedback })
        // The stored attempt and the ranking are server data.
        router.refresh()
        setPhase('idle')
        return
      }
      setPhase('error')
    } catch {
      setErrorMsg(t('gradingError'))
      setPhase('error')
    } finally {
      finishingRef.current = false
    }
  }, [maxMinutes, onResult, realtime, releaseMic, router, t, tp, tab, token])

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

  // A dropped socket mid-call: grade what was said instead of stranding the member.
  const wasConnectedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'live') {
      wasConnectedRef.current = false
      return
    }
    if (status === 'connected') wasConnectedRef.current = true
    else if (wasConnectedRef.current && (status === 'disconnected' || status === 'error')) void finishRef.current()
  }, [phase, status])

  // Tutor-initiated ending: let the goodbye finish playing first.
  useEffect(() => {
    if (!endRequested || phase !== 'live' || isPlaying) return
    const id = setTimeout(() => void finishRef.current(), 1200)
    return () => clearTimeout(id)
  }, [endRequested, phase, isPlaying])

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

  return (
    <section className="space-y-4" aria-busy={phase === 'grading'} data-testid="challenge-voice-player">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-6">
        <Persona state={personaState} variant="halo" className="size-36" />
        <p className="text-sm font-medium" role="status" aria-live="polite">{statusLabel}</p>
        {phase === 'live' && status === 'connected' ? (
          <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-label={t('timeLeft')}>{clock(secondsLeft)}</p>
        ) : null}
        {errorMsg ? (
          <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {errorMsg}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {phase === 'live' ? (
            <>
              <Button variant="outline" size="lg" onClick={toggleMute} disabled={status !== 'connected'} aria-pressed={muted}>
                {muted ? <IconMicrophoneOff size={16} aria-hidden="true" /> : <IconMicrophone size={16} aria-hidden="true" />}
                {muted ? t('unmute') : t('mute')}
              </Button>
              <Button size="lg" onClick={() => void finish()} disabled={status !== 'connected'}>
                <IconPhoneOff size={16} aria-hidden="true" />
                {t('finish')}
              </Button>
            </>
          ) : phase === 'grading' ? (
            <Button disabled size="lg">
              <IconLoader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t('grading')}
            </Button>
          ) : (
            <Button size="lg" onClick={() => void start()} data-testid="challenge-voice-start">
              <IconMicrophone size={16} aria-hidden="true" />
              {phase === 'error' ? t('startAgain') : t('start')}
            </Button>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
          <IconBulb size={14} aria-hidden="true" />
          {tp('voiceColdNote', { minutes: maxMinutes })}
        </p>
      </div>

      {phase === 'live' || phase === 'grading' ? (
        <div className="rounded-xl border border-border">
          <h3 className="border-b px-4 py-3 text-sm font-semibold">{t('liveTranscript')}</h3>
          <Conversation className="h-64">
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
      ) : null}
    </section>
  )
}
