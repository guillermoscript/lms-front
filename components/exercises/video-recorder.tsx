'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconVideo, IconPlayerStop, IconRefresh, IconCheck, IconUpload } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

type RecorderState = 'idle' | 'countdown' | 'recording' | 'review' | 'submitting'

interface VideoRecorderProps {
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

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/ogg',
])
const ALLOWED_EXTENSIONS = '.mp4,.webm,.mov'
const MAX_FILE_SIZE_MB = 100
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Math.round(video.duration))
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read video file'))
    }
    video.src = url
  })
}

function getSupportedVideoMimeType(): string {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

export function VideoRecorderComponent({
  onRecordingComplete,
  isSubmitting = false,
  maxDurationSeconds = 300,
  minDurationSeconds = 5,
  disabled = false,
}: VideoRecorderProps) {
  const t = useTranslations('exercises.video')
  const [state, setState] = useState<RecorderState>('idle')
  const [countdown, setCountdown] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const liveVideoRef = useRef<HTMLVideoElement>(null)
  const reviewVideoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const durationRef = useRef(0)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    stopTimer()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null
    }
  }, [stopTimer])

  useEffect(() => {
    if (state === 'recording' && elapsed >= maxDurationSeconds) {
      stopRecording()
    }
  }, [elapsed, maxDurationSeconds, state, stopRecording])

  useEffect(() => {
    return () => {
      stopTimer()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [stopTimer, videoUrl])

  const startCountdown = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream
      }

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
      setError(t('cameraDenied'))
    }
  }

  const startActualRecording = (stream: MediaStream) => {
    const mimeType = getSupportedVideoMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder
    chunksRef.current = []
    durationRef.current = 0

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const recordedBlob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      const url = URL.createObjectURL(recordedBlob)
      setBlob(recordedBlob)
      setVideoUrl(url)
      setState('review')
    }

    recorder.start(250)
    setState('recording')
    setElapsed(0)

    timerRef.current = setInterval(() => {
      durationRef.current++
      setElapsed((e) => e + 1)
    }, 1000)
  }

  const handleReRecord = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setBlob(null)
    setVideoUrl(null)
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
    e.target.value = ''

    if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
      setError(t('unsupportedFile'))
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t('fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1), max: MAX_FILE_SIZE_MB }))
      return
    }

    try {
      const duration = await getVideoDuration(file)

      if (duration < minDurationSeconds) {
        setError(t('videoTooShort', { duration, min: minDurationSeconds }))
        return
      }
      if (duration > maxDurationSeconds) {
        setError(t('videoTooLong', { duration, max: maxDurationSeconds }))
        return
      }

      const url = URL.createObjectURL(file)
      setBlob(file)
      setVideoUrl(url)
      setElapsed(duration)
      durationRef.current = duration
      setState('review')
    } catch {
      setError(t('unsupportedFile'))
    }
  }

  const isBelowMin = elapsed < minDurationSeconds && state === 'recording'
  const showLiveVideo = state === 'countdown' || state === 'recording'

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Live camera preview — shown during countdown and recording */}
      <div className={cn(
        'relative rounded-xl overflow-hidden bg-black aspect-video',
        !showLiveVideo && state !== 'review' && 'hidden'
      )}>
        <video
          ref={liveVideoRef}
          autoPlay
          muted
          playsInline
          className={cn('w-full h-full object-cover', !showLiveVideo && 'hidden')}
          aria-label="Camera preview"
        />

        {/* Countdown overlay */}
        {state === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="text-7xl font-black text-white tabular-nums drop-shadow-lg">{countdown}</div>
              <p className="mt-2 text-sm text-white/80">{t('getReady')}</p>
            </div>
          </div>
        )}

        {/* Recording indicator */}
        {state === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {formatTime(elapsed)}
            </span>
            <span className="text-xs text-white/60 ml-1">
              / {t('maxDuration', { time: formatTime(maxDurationSeconds) })}
            </span>
          </div>
        )}
      </div>

      {/* Review video player */}
      {state === 'review' && videoUrl && (
        <div className="rounded-xl overflow-hidden bg-black aspect-video">
          <video
            ref={reviewVideoRef}
            src={videoUrl}
            controls
            playsInline
            className="w-full h-full object-contain"
            aria-label="Recording preview"
          />
        </div>
      )}

      {/* Review timer */}
      {state === 'review' && (
        <p className="text-xs text-muted-foreground font-mono text-center">
          {formatTime(elapsed)}
        </p>
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
              <IconVideo size={18} />
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
