'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconMicrophone, IconPlayerStop, IconRefresh, IconCheck, IconUpload } from '@tabler/icons-react'
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
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(data)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.beginPath()
    ctx.strokeStyle = 'hsl(var(--primary))'
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

    animFrameRef.current = requestAnimationFrame(drawWaveform)
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Waveform canvas — visible while recording */}
      {state === 'recording' && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/[0.03] overflow-hidden">
          <canvas
            ref={canvasRef}
            width={600}
            height={80}
            className="w-full h-20"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Timer */}
      {(state === 'recording' || state === 'review') && (
        <div className="flex items-center justify-between text-sm">
          <span className={cn(
            'font-mono font-bold tabular-nums',
            state === 'recording' ? 'text-rose-500' : 'text-muted-foreground'
          )}>
            {state === 'recording' ? '⏺ ' : ''}{formatTime(elapsed)}
          </span>
          <span className="text-muted-foreground text-xs">
            {t('maxDuration', { time: formatTime(maxDurationSeconds) })}
          </span>
        </div>
      )}

      {/* Countdown overlay */}
      {state === 'countdown' && (
        <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-primary/20 bg-primary/[0.03]">
          <div className="text-center">
            <div className="text-5xl font-black text-primary tabular-nums">{countdown}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t('getReady')}</p>
          </div>
        </div>
      )}

      {/* Audio review player */}
      {state === 'review' && audioUrl && (
        <audio
          src={audioUrl}
          controls
          className="w-full rounded-lg"
          aria-label="Recording preview"
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        onChange={handleFileUpload}
        className="hidden"
        aria-hidden="true"
      />

      {/* Controls */}
      <div className="flex items-center gap-3">
        {state === 'idle' && (
          <>
            <Button
              onClick={startCountdown}
              disabled={disabled}
              className="gap-2 flex-1"
              size="lg"
            >
              <IconMicrophone size={18} />
              {t('record')}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="gap-2"
              size="lg"
            >
              <IconUpload size={18} />
              {t('upload')}
            </Button>
          </>
        )}

        {state === 'recording' && (
          <Button
            onClick={stopRecording}
            variant="outline"
            className="gap-2 flex-1 border-rose-500/30 text-rose-600 hover:bg-rose-500/5"
            size="lg"
            disabled={isBelowMin}
          >
            <IconPlayerStop size={18} />
            {isBelowMin
              ? t('keepRecording', { seconds: minDurationSeconds - elapsed })
              : t('stop')}
          </Button>
        )}

        {state === 'review' && (
          <>
            <Button
              variant="outline"
              onClick={handleReRecord}
              className="gap-2"
              size="lg"
            >
              <IconRefresh size={16} />
              {t('reRecord')}
            </Button>
            <Button
              onClick={handleSubmit}
              className="gap-2 flex-1"
              size="lg"
            >
              <IconCheck size={16} />
              {t('submitRecording')}
            </Button>
          </>
        )}

        {(state === 'submitting' || isSubmitting) && (
          <Button disabled className="gap-2 flex-1" size="lg">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {t('uploading')}
          </Button>
        )}
      </div>
    </div>
  )
}
