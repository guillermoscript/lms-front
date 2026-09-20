'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconAlertTriangle, IconMicrophone, IconPlayerStop, IconRefresh, IconCheck, IconUpload } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

type RecorderState = 'idle' | 'countdown' | 'recording' | 'review' | 'submitting'

interface MediaRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void
  isSubmitting?: boolean
  maxDurationSeconds?: number
  minDurationSeconds?: number
  disabled?: boolean
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Upload limits
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',      // .mp3
  'audio/mp4',       // .m4a
  'audio/ogg',       // .ogg
  'audio/wav',       // .wav
  'audio/webm',      // .webm
  'audio/x-m4a',     // .m4a variant
  'audio/aac',       // .aac
])
const ALLOWED_EXTENSIONS = '.mp3,.m4a,.ogg,.wav,.webm,.aac'
const MAX_FILE_SIZE_MB = 25
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    const url = URL.createObjectURL(file)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Math.round(audio.duration))
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read audio file'))
    }
    audio.src = url
  })
}

// Try supported mimeTypes in order of preference
function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

export function MediaRecorderComponent({
  onRecordingComplete,
  isSubmitting = false,
  maxDurationSeconds = 300,
  minDurationSeconds = 5,
  disabled = false,
}: MediaRecorderProps) {
  const t = useTranslations('exercises.audio')
  const [state, setState] = useState<RecorderState>('idle')
  const [countdown, setCountdown] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const durationRef = useRef(0)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
  }, [])

  const drawWaveform = useCallback(() => {
    // A named inner loop: the callback can't reference itself before it exists.
    const draw = () => {
      const canvas = canvasRef.current
      const analyser = analyserRef.current
      if (!canvas || !analyser) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteTimeDomainData(data)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.beginPath()
      // The tokens are OKLCH, so `hsl(var(--primary))` was an invalid color and
      // the stroke fell back to black — invisible in dark mode.
      ctx.strokeStyle = getComputedStyle(canvas).color
      ctx.lineWidth = 2

      const sliceWidth = canvas.width / data.length
      let x = 0

      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0
        const y = (v * canvas.height) / 2
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceWidth
      }
      ctx.stroke()

      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
  }, [])

  const stopRecording = useCallback(() => {
    stopTimer()
    stopAnimation()

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [stopTimer, stopAnimation])

  // Auto-stop when max duration reached
  useEffect(() => {
    if (state === 'recording' && elapsed >= maxDurationSeconds) {
      stopRecording()
    }
  }, [elapsed, maxDurationSeconds, state, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer()
      stopAnimation()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [stopTimer, stopAnimation, audioUrl])

  const startCountdown = async () => {
    setError(null)
    try {
      // Browsers only expose the microphone on https (or localhost). On plain
      // http there is no permission prompt at all — say so instead of blaming
      // a denial the user never made.
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(t('micInsecure'))
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up audio analyser for waveform
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      setState('countdown')
      setCountdown(3)

      let count = 3
      const interval = setInterval(() => {
        count--
        setCountdown(count)
        if (count <= 0) {
          clearInterval(interval)
          startActualRecording(stream)
        }
      }, 1000)
    } catch {
      setError(t('micDenied'))
    }
  }

  const startActualRecording = (stream: MediaStream) => {
    const mimeType = getSupportedMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder
    chunksRef.current = []
    durationRef.current = 0

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const recordedBlob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
      const url = URL.createObjectURL(recordedBlob)
      setBlob(recordedBlob)
      setAudioUrl(url)
      setState('review')
    }

    recorder.start(250) // collect data every 250ms
    setState('recording')
    setElapsed(0)

    timerRef.current = setInterval(() => {
      durationRef.current++
      setElapsed((e) => e + 1)
    }, 1000)

    drawWaveform()
  }

  const handleReRecord = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setState('idle')
  }

  const handleSubmit = () => {
    if (!blob) return
    setState('submitting')
    onRecordingComplete(blob, durationRef.current)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so the same file can be re-selected
    e.target.value = ''

    // Validate type
    if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
      setError(t('unsupportedFile'))
      return
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t('fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1), max: MAX_FILE_SIZE_MB }))
      return
    }

    // Validate duration
    try {
      const duration = await getAudioDuration(file)

      if (duration < minDurationSeconds) {
        setError(t('audioTooShort', { duration, min: minDurationSeconds }))
        return
      }

      if (duration > maxDurationSeconds) {
        setError(t('audioTooLong', { duration, max: maxDurationSeconds }))
        return
      }

      const url = URL.createObjectURL(file)
      setBlob(file)
      setAudioUrl(url)
      setElapsed(duration)
      durationRef.current = duration
      setState('review')
    } catch {
      setError(t('unsupportedFile'))
    }
  }

  const isBelowMin = elapsed < minDurationSeconds && state === 'recording'

  const busy = state === 'submitting' || isSubmitting

  // A dictaphone, not a form: one round control under a fixed stage, so the
  // panel keeps its height while idle → countdown → recording → review swap.
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {error && (
        <p className="flex items-start gap-2 text-left text-sm text-destructive" role="alert">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex h-16 w-full items-center justify-center">
        {state === 'idle' && (
          // Where the waveform will be: the same strip, at rest.
          <div className="flex w-full items-center justify-between" aria-hidden="true">
            {Array.from({ length: 48 }, (_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-foreground/20" />
            ))}
          </div>
        )}

        {state === 'countdown' && (
          <p className="text-5xl font-bold tabular-nums" role="status" aria-label={t('getReady')}>
            {countdown}
          </p>
        )}

        {state === 'recording' && (
          <canvas
            ref={canvasRef}
            width={600}
            height={80}
            className="h-16 w-full text-foreground"
            aria-hidden="true"
          />
        )}

        {(state === 'review' || state === 'submitting') && audioUrl && (
          <audio src={audioUrl} controls className="h-10 w-full" aria-label={t('recordingPreview')} />
        )}
      </div>

      <p className="flex items-center gap-2 font-mono text-base tabular-nums">
        {state === 'recording' && (
          <span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-hidden="true" />
        )}
        <span className={cn('font-semibold', state === 'idle' && 'text-muted-foreground')}>
          {formatTime(elapsed)}
        </span>
        <span className="text-muted-foreground">/ {formatTime(maxDurationSeconds)}</span>
      </p>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        onChange={handleFileUpload}
        className="hidden"
        aria-hidden="true"
      />

      {(state === 'idle' || state === 'countdown') && (
        <div className="flex flex-col items-center gap-2">
          {/* An intentional circle: the one control on the panel. */}
          <Button
            onClick={startCountdown}
            disabled={disabled || state === 'countdown'}
            aria-label={t('record')}
            className="size-[4.5rem] rounded-full p-0"
          >
            <IconMicrophone className="size-7" aria-hidden="true" />
          </Button>
          <span className="text-sm font-medium" aria-hidden="true">
            {state === 'countdown' ? t('getReady') : t('record')}
          </span>
          {state === 'idle' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              <IconUpload size={16} aria-hidden="true" />
              {t('orUpload')}
            </button>
          )}
        </div>
      )}

      {state === 'recording' && (
        <div className="flex flex-col items-center gap-2">
          <Button
            onClick={stopRecording}
            variant="destructive"
            disabled={isBelowMin}
            aria-label={t('stop')}
            className="size-[4.5rem] rounded-full p-0"
          >
            <IconPlayerStop className="size-7" aria-hidden="true" />
          </Button>
          <span className="text-sm font-medium" aria-live="polite">
            {isBelowMin ? t('keepRecording', { seconds: minDurationSeconds - elapsed }) : t('stop')}
          </span>
        </div>
      )}

      {state === 'review' && !busy && (
        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={handleReRecord} size="lg" className="h-11 gap-2 text-sm sm:px-5">
            <IconRefresh size={16} aria-hidden="true" />
            {t('reRecord')}
          </Button>
          <Button onClick={handleSubmit} size="lg" className="h-11 gap-2 text-sm sm:px-6">
            <IconCheck size={16} aria-hidden="true" />
            {t('submitRecording')}
          </Button>
        </div>
      )}

      {busy && (
        <Button disabled size="lg" className="h-11 gap-2 text-sm sm:px-6">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
          {t('uploading')}
        </Button>
      )}
    </div>
  )
}
