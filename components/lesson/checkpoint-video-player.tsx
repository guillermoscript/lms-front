'use client'

import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Provider-aware video player that pauses at checkpoint markers (issue #392).
 *
 * This component owns ONLY playback + marker-crossing detection. It has no
 * knowledge of what a "checkpoint" is beyond a timestamp — the parent is
 * responsible for rendering the question UI when `onMarkerReached` fires and
 * for calling `playerRef.current.resume()` once the student is done.
 */

export type VideoProvider = 'youtube' | 'vimeo' | 'native'

export interface CheckpointVideoMarker {
  checkpointId: number
  timeSeconds: number
  completed: boolean
  allowSkip: boolean
  label?: string | null
}

export interface CheckpointVideoPlayerHandle {
  resume(): void
  pause(): void
  getCurrentTime(): Promise<number>
}

/** The only four points at which `onProgressMilestone` ever fires. */
export type VideoProgressMilestone = 25 | 50 | 75 | 100

interface CheckpointVideoPlayerProps {
  url: string
  title?: string
  markers: CheckpointVideoMarker[]
  onMarkerReached?: (marker: CheckpointVideoMarker) => void
  /**
   * Analytics seam (`docs/ANALYTICS_OPENPANEL.md` §4 Loop D). Fires at most
   * once per milestone per `progressResetKey`, and ONLY on a real playback
   * crossing — see `useProgressMilestones` for why that distinction is the
   * whole point. Purely observational: the player's behaviour does not depend
   * on it and a throwing callback cannot break playback.
   */
  onProgressMilestone?: (percent: VideoProgressMilestone) => void
  /**
   * Clears the fired-milestone set when it changes. Pass the lesson id: this
   * component can be reused across lessons without remounting, and a stale set
   * would swallow every milestone on the second lesson.
   */
  progressResetKey?: string | number
  playerRef?: React.RefObject<CheckpointVideoPlayerHandle | null>
  className?: string
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/** Keep the latest value in a ref without touching it during render. */
function useLatest<T>(value: T): React.RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

export function getVideoProvider(url: string): VideoProvider | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '')

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    return extractYouTubeId(url) ? 'youtube' : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    return extractVimeoId(url) ? 'vimeo' : null
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return 'native'
  }
  return null
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  )
  return match ? match[1] : null
}

function extractVimeoId(url: string): string | null {
  const match = url.match(
    /vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/
  )
  return match ? match[1] : null
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Provider adapter contract — every provider hook returns this shape
// ---------------------------------------------------------------------------

interface PlayerAdapter {
  play: () => void
  pause: () => void
  seekTo: (seconds: number) => void
  getCurrentTime: () => Promise<number>
}

// ---------------------------------------------------------------------------
// Marker scheduler — provider-agnostic crossing/seek-gating logic
// ---------------------------------------------------------------------------

const EPS = 0.05
const SEEK_JUMP_THRESHOLD = 1.0
const RESUME_CLEAR_MARGIN = 0.3

function useMarkerScheduler({
  markers,
  onMarkerReached,
  pause,
  seekTo,
}: {
  markers: CheckpointVideoMarker[]
  onMarkerReached?: (marker: CheckpointVideoMarker) => void
  pause: () => void
  seekTo: (seconds: number) => void
}) {
  const markersRef = useLatest(markers)
  const onMarkerReachedRef = useLatest(onMarkerReached)
  const pauseRef = useLatest(pause)
  const seekToRef = useLatest(seekTo)

  const lastTimeRef = useRef(0)
  const firedMarkerRef = useRef<number | null>(null)
  const initializedRef = useRef(false)

  const reset = useCallback(() => {
    lastTimeRef.current = 0
    firedMarkerRef.current = null
    initializedRef.current = false
  }, [])

  const handleTime = useCallback((newTime: number) => {
    const sorted = [...markersRef.current].sort((a, b) => a.timeSeconds - b.timeSeconds)

    if (!initializedRef.current) {
      lastTimeRef.current = newTime
      initializedRef.current = true
      return
    }

    const previous = lastTimeRef.current
    const delta = newTime - previous
    const isSeek = delta < -EPS || delta > SEEK_JUMP_THRESHOLD

    if (isSeek) {
      const blocking = sorted.find(
        (m) => !m.completed && !m.allowSkip && m.timeSeconds < newTime - EPS
      )
      if (blocking) {
        seekToRef.current(blocking.timeSeconds)
        pauseRef.current()
        if (firedMarkerRef.current !== blocking.checkpointId) {
          onMarkerReachedRef.current?.(blocking)
        }
        firedMarkerRef.current = blocking.checkpointId
        lastTimeRef.current = blocking.timeSeconds
        return
      }

      // Free seek (forward past allowSkip markers, or backward). If we
      // seeked before the marker we're currently "parked" at, clear the
      // guard so playing across it again re-fires it.
      if (firedMarkerRef.current !== null) {
        const firedMarker = sorted.find((m) => m.checkpointId === firedMarkerRef.current)
        if (firedMarker && newTime < firedMarker.timeSeconds - EPS) {
          firedMarkerRef.current = null
        }
      }
      lastTimeRef.current = newTime
      return
    }

    // Normal forward playback — did we cross an uncompleted marker?
    const crossed = sorted.find(
      (m) =>
        !m.completed &&
        m.checkpointId !== firedMarkerRef.current &&
        m.timeSeconds > previous + EPS &&
        m.timeSeconds <= newTime + EPS
    )
    if (crossed) {
      pauseRef.current()
      onMarkerReachedRef.current?.(crossed)
      firedMarkerRef.current = crossed.checkpointId
      lastTimeRef.current = crossed.timeSeconds
      return
    }

    if (firedMarkerRef.current !== null) {
      const firedMarker = sorted.find((m) => m.checkpointId === firedMarkerRef.current)
      if (!firedMarker || newTime > firedMarker.timeSeconds + RESUME_CLEAR_MARGIN) {
        firedMarkerRef.current = null
      }
    }
    lastTimeRef.current = newTime
  }, [markersRef, onMarkerReachedRef, pauseRef, seekToRef])

  return { handleTime, reset }
}

// ---------------------------------------------------------------------------
// Progress milestones — provider-agnostic, crossing-only
// ---------------------------------------------------------------------------

const PROGRESS_MILESTONES: readonly VideoProgressMilestone[] = [25, 50, 75, 100]

/**
 * Emits 25/50/75/100% at most once each, and ONLY when playback genuinely
 * crossed the mark.
 *
 * THE BUG THIS EXISTS TO AVOID: the obvious implementation is "for every
 * unfired milestone <= current percent, fire it". Under that rule a student who
 * drags the scrubber to the end instantly emits 25, 50, 75 and 100 and is
 * indistinguishable from someone who watched the whole video. That is worse
 * than having no `video_progress` at all, because the number looks credible
 * enough to trust.
 *
 * So a milestone fires only if the PREVIOUS tick was below it and the current
 * tick is at or past it, and only when the two ticks are contiguous playback.
 * A seek jumps the gap and the skipped milestones never register — a scrub to
 * the end produces nothing.
 *
 * Seek detection reuses the marker scheduler's thresholds deliberately: every
 * provider here ticks at 250-300ms, so a real playback delta is ~0.3s and
 * anything past `SEEK_JUMP_THRESHOLD` (1s) or any backward motion is a jump.
 *
 * 100% does NOT come from this path — see `handleEnded`.
 */
function useProgressMilestones({
  onProgressMilestone,
  durationRef,
}: {
  onProgressMilestone?: (percent: VideoProgressMilestone) => void
  durationRef: React.RefObject<number | null>
}) {
  const onMilestoneRef = useLatest(onProgressMilestone)
  const firedRef = useRef<Set<number>>(new Set())
  const lastTimeRef = useRef<number | null>(null)

  const reset = useCallback(() => {
    firedRef.current = new Set()
    lastTimeRef.current = null
  }, [])

  /** Never lets an analytics callback surface as a playback failure. */
  const emit = useCallback(
    (milestone: VideoProgressMilestone) => {
      if (firedRef.current.has(milestone)) return
      firedRef.current.add(milestone)
      try {
        onMilestoneRef.current?.(milestone)
      } catch {
        // Observational only. A broken listener must not stop the video.
      }
    },
    [onMilestoneRef]
  )

  const handleTime = useCallback(
    (newTime: number) => {
      const duration = durationRef.current
      if (!duration || duration <= 0) return

      const previous = lastTimeRef.current
      lastTimeRef.current = newTime

      // First sample only establishes a baseline. Treating it as a crossing
      // would fire every milestone below the resume point for anyone who
      // returns to a video part-way through.
      if (previous === null) return

      const delta = newTime - previous
      if (delta < -EPS || delta > SEEK_JUMP_THRESHOLD) return // seek: no credit

      const previousPercent = (previous / duration) * 100
      const currentPercent = (newTime / duration) * 100

      for (const milestone of PROGRESS_MILESTONES) {
        // 100 is owned by `handleEnded`.
        if (milestone === 100) continue
        if (previousPercent < milestone && currentPercent >= milestone) {
          emit(milestone)
        }
      }
    },
    [durationRef, emit]
  )

  /**
   * 100% is driven by the provider's own `ended` signal rather than
   * `time >= duration`. Reported durations are routinely a fraction of a second
   * longer than the last tick a player actually emits, so a time-based 100%
   * silently under-reports completion — the one milestone you most want to be
   * right.
   */
  const handleEnded = useCallback(() => emit(100), [emit])

  return { handleTime, handleEnded, reset }
}

// ---------------------------------------------------------------------------
// YouTube IFrame API
// ---------------------------------------------------------------------------

interface YTPlayerState {
  UNSTARTED: number
  ENDED: number
  PLAYING: number
  PAUSED: number
  BUFFERING: number
  CUED: number
}

interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  destroy(): void
}

interface YTPlayerEvent {
  data: number
  target: YTPlayer
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        options: {
          videoId?: string
          playerVars?: Record<string, number | string>
          events?: {
            onReady?: (event: YTPlayerEvent) => void
            onStateChange?: (event: YTPlayerEvent) => void
          }
        }
      ) => YTPlayer
      PlayerState: YTPlayerState
    }
    onYouTubeIframeAPIReady?: () => void
    Vimeo?: {
      Player: new (el: HTMLElement, options: { id?: number; url?: string }) => VimeoPlayer
    }
  }
}

let youtubeApiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.YT?.Player) return Promise.resolve()
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    )
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    }
  })
  return youtubeApiPromise
}

function useYouTubePlayer({
  enabled,
  url,
  containerRef,
  onTime,
  onDuration,
  onEnded,
}: {
  enabled: boolean
  url: string
  containerRef: React.RefObject<HTMLDivElement | null>
  onTime: (t: number) => void
  onDuration: (d: number) => void
  onEnded: () => void
}): PlayerAdapter {
  const playerRef = useRef<YTPlayer | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onTimeRef = useLatest(onTime)
  const onDurationRef = useLatest(onDuration)
  const onEndedRef = useLatest(onEnded)

  useEffect(() => {
    if (!enabled) return
    const videoId = extractYouTubeId(url)
    if (!videoId || !containerRef.current) return
    let cancelled = false

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    const startPolling = () => {
      stopPolling()
      intervalRef.current = setInterval(() => {
        const p = playerRef.current
        if (!p) return
        onTimeRef.current(p.getCurrentTime())
      }, 300)
    }

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return
      const player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: (event) => {
            const duration = event.target.getDuration()
            if (duration > 0) onDurationRef.current(duration)
          },
          onStateChange: (event) => {
            const YT = window.YT
            if (!YT) return
            if (event.data === YT.PlayerState.PLAYING) {
              const duration = event.target.getDuration()
              if (duration > 0) onDurationRef.current(duration)
              startPolling()
            } else {
              stopPolling()
              if (event.data === YT.PlayerState.ENDED) onEndedRef.current()
            }
          },
        },
      })
      playerRef.current = player
    })

    return () => {
      cancelled = true
      stopPolling()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [enabled, url, containerRef, onTimeRef, onDurationRef, onEndedRef])

  const play = useCallback(() => playerRef.current?.playVideo(), [])
  const pause = useCallback(() => playerRef.current?.pauseVideo(), [])
  const seekTo = useCallback((seconds: number) => playerRef.current?.seekTo(seconds, true), [])
  const getCurrentTime = useCallback(async () => playerRef.current?.getCurrentTime() ?? 0, [])

  return useMemo(
    () => ({ play, pause, seekTo, getCurrentTime }),
    [play, pause, seekTo, getCurrentTime]
  )
}

// ---------------------------------------------------------------------------
// Vimeo Player API (player.js)
// ---------------------------------------------------------------------------

interface VimeoPlayer {
  getCurrentTime(): Promise<number>
  getDuration(): Promise<number>
  play(): Promise<void>
  pause(): Promise<void>
  setCurrentTime(seconds: number): Promise<number>
  on(event: string, cb: (data: { seconds: number }) => void): void
  off(event: string, cb?: (data: { seconds: number }) => void): void
  destroy(): Promise<void>
}

let vimeoApiPromise: Promise<void> | null = null

function loadVimeoApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.Vimeo?.Player) return Promise.resolve()
  if (vimeoApiPromise) return vimeoApiPromise

  vimeoApiPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://player.vimeo.com/api/player.js"]'
    )
    if (existing) {
      existing.addEventListener('load', () => resolve())
      if (window.Vimeo?.Player) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://player.vimeo.com/api/player.js'
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
  return vimeoApiPromise
}

function useVimeoPlayer({
  enabled,
  url,
  containerRef,
  onTime,
  onDuration,
  onEnded,
}: {
  enabled: boolean
  url: string
  containerRef: React.RefObject<HTMLDivElement | null>
  onTime: (t: number) => void
  onDuration: (d: number) => void
  onEnded: () => void
}): PlayerAdapter {
  const playerRef = useRef<VimeoPlayer | null>(null)
  const onTimeRef = useLatest(onTime)
  const onDurationRef = useLatest(onDuration)
  const onEndedRef = useLatest(onEnded)

  useEffect(() => {
    if (!enabled) return
    const videoId = extractVimeoId(url)
    if (!videoId || !containerRef.current) return
    let cancelled = false

    const handleTimeUpdate = (data: { seconds: number }) => onTimeRef.current(data.seconds)
    const handleSeeked = (data: { seconds: number }) => onTimeRef.current(data.seconds)
    const handleEnded = () => onEndedRef.current()

    loadVimeoApi().then(() => {
      if (cancelled || !containerRef.current || !window.Vimeo) return
      const player = new window.Vimeo.Player(containerRef.current, { id: Number(videoId) })
      playerRef.current = player
      player
        .getDuration()
        .then((d) => {
          if (!cancelled && d > 0) onDurationRef.current(d)
        })
        .catch(() => {})
      player.on('timeupdate', handleTimeUpdate)
      player.on('seeked', handleSeeked)
      player.on('ended', handleEnded)
    })

    return () => {
      cancelled = true
      const p = playerRef.current
      if (p) {
        p.off('timeupdate', handleTimeUpdate)
        p.off('seeked', handleSeeked)
        p.off('ended', handleEnded)
        p.destroy().catch(() => {})
      }
      playerRef.current = null
    }
  }, [enabled, url, containerRef, onTimeRef, onDurationRef, onEndedRef])

  const play = useCallback(() => {
    playerRef.current?.play().catch(() => {})
  }, [])
  const pause = useCallback(() => {
    playerRef.current?.pause().catch(() => {})
  }, [])
  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.setCurrentTime(seconds).catch(() => {})
  }, [])
  const getCurrentTime = useCallback(async () => {
    try {
      return (await playerRef.current?.getCurrentTime()) ?? 0
    } catch {
      return 0
    }
  }, [])

  return useMemo(
    () => ({ play, pause, seekTo, getCurrentTime }),
    [play, pause, seekTo, getCurrentTime]
  )
}

// ---------------------------------------------------------------------------
// Native <video>
// ---------------------------------------------------------------------------

function useNativePlayer({
  enabled,
  videoRef,
  onTime,
  onDuration,
  onEnded,
}: {
  enabled: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  onTime: (t: number) => void
  onDuration: (d: number) => void
  onEnded: () => void
}): PlayerAdapter {
  const onTimeRef = useLatest(onTime)
  const onDurationRef = useLatest(onDuration)
  const onEndedRef = useLatest(onEnded)

  useEffect(() => {
    if (!enabled) return
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => onTimeRef.current(video.currentTime)
    const handleSeeking = () => onTimeRef.current(video.currentTime)
    const handleSeeked = () => onTimeRef.current(video.currentTime)
    const handleEnded = () => onEndedRef.current()
    const handleLoadedMetadata = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        onDurationRef.current(video.duration)
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('seeking', handleSeeking)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    if (video.readyState >= 1) handleLoadedMetadata()

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('seeking', handleSeeking)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [enabled, videoRef, onTimeRef, onDurationRef, onEndedRef])

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {})
  }, [videoRef])
  const pause = useCallback(() => {
    videoRef.current?.pause()
  }, [videoRef])
  const seekTo = useCallback(
    (seconds: number) => {
      if (videoRef.current) videoRef.current.currentTime = seconds
    },
    [videoRef]
  )
  const getCurrentTime = useCallback(async () => videoRef.current?.currentTime ?? 0, [videoRef])

  return useMemo(
    () => ({ play, pause, seekTo, getCurrentTime }),
    [play, pause, seekTo, getCurrentTime]
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CheckpointVideoPlayer({
  url,
  title,
  markers,
  onMarkerReached,
  onProgressMilestone,
  progressResetKey,
  playerRef,
  className,
}: CheckpointVideoPlayerProps) {
  const provider = useMemo(() => getVideoProvider(url), [url])
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState<number | null>(null)
  // The milestone hook runs inside a stable callback, so it cannot read
  // `duration` from the closure without re-subscribing every provider.
  const durationRef = useLatest(duration)

  const activeAdapterRef = useRef<PlayerAdapter | null>(null)

  const pauseActive = useCallback(() => activeAdapterRef.current?.pause(), [])
  const seekToActive = useCallback((seconds: number) => activeAdapterRef.current?.seekTo(seconds), [])

  const { handleTime, reset } = useMarkerScheduler({
    markers,
    onMarkerReached,
    pause: pauseActive,
    seekTo: seekToActive,
  })

  const {
    handleTime: handleProgressTime,
    handleEnded: handleProgressEnded,
    reset: resetProgress,
  } = useProgressMilestones({ onProgressMilestone, durationRef })

  const handleTimeRef = useLatest(handleTime)
  const handleProgressTimeRef = useLatest(handleProgressTime)
  // Both consumers ride the SAME existing 300ms tick — no second timer, no
  // extra polling, nothing added to the player's runtime cost.
  const onTime = useCallback(
    (t: number) => {
      handleTimeRef.current(t)
      handleProgressTimeRef.current(t)
    },
    [handleTimeRef, handleProgressTimeRef]
  )
  const handleProgressEndedRef = useLatest(handleProgressEnded)
  const onEnded = useCallback(() => handleProgressEndedRef.current(), [handleProgressEndedRef])

  const youtubeAdapter = useYouTubePlayer({
    enabled: provider === 'youtube',
    url,
    containerRef,
    onTime,
    onDuration: setDuration,
    onEnded,
  })
  const vimeoAdapter = useVimeoPlayer({
    enabled: provider === 'vimeo',
    url,
    containerRef,
    onTime,
    onDuration: setDuration,
    onEnded,
  })
  const nativeAdapter = useNativePlayer({
    enabled: provider === 'native',
    videoRef,
    onTime,
    onDuration: setDuration,
    onEnded,
  })

  const activeAdapter =
    provider === 'youtube' ? youtubeAdapter : provider === 'vimeo' ? vimeoAdapter : provider === 'native' ? nativeAdapter : null
  useEffect(() => {
    activeAdapterRef.current = activeAdapter
  })

  // Reset duration + marker-crossing state when the video source changes.
  // Done as a render-time state adjustment (not an effect) so the marker
  // strip never paints one frame against the previous video's duration.
  const [lastUrl, setLastUrl] = useState(url)
  if (lastUrl !== url) {
    setLastUrl(url)
    setDuration(null)
    reset()
    resetProgress()
  }

  // Separate from the url reset above, and not redundant with it: two lessons
  // can legitimately point at the same video, in which case the url never
  // changes and the fired-milestone set would carry over and swallow every
  // milestone on the second lesson.
  const [lastProgressKey, setLastProgressKey] = useState(progressResetKey)
  if (lastProgressKey !== progressResetKey) {
    setLastProgressKey(progressResetKey)
    resetProgress()
  }

  useEffect(() => {
    if (!playerRef) return
    playerRef.current = {
      resume: () => activeAdapterRef.current?.play(),
      pause: () => activeAdapterRef.current?.pause(),
      getCurrentTime: () => activeAdapterRef.current?.getCurrentTime() ?? Promise.resolve(0),
    }
    return () => {
      if (playerRef) playerRef.current = null
    }
  }, [playerRef, provider])

  return (
    <div className={cn('w-full', className)}>
      {title && <h4 className="mb-2 text-sm font-semibold">{title}</h4>}
      <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
        {provider === 'youtube' || provider === 'vimeo' ? (
          <div ref={containerRef} className="h-full w-full" />
        ) : provider === 'native' ? (
          <video ref={videoRef} controls className="h-full w-full" src={url} aria-label={title ?? 'Lesson video'} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
            <span>Unable to load video.</span>
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                Open link
              </a>
            )}
          </div>
        )}
      </div>
      {provider && duration && duration > 0 && markers.length > 0 && (
        <div className="relative mt-2 h-1.5 w-full rounded-full bg-muted" aria-hidden="true">
          {markers.map((marker) => (
            <span
              key={marker.checkpointId}
              className={cn(
                'absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background',
                marker.completed ? 'bg-primary' : 'bg-muted-foreground/60'
              )}
              style={{ left: `${Math.min(100, Math.max(0, (marker.timeSeconds / duration) * 100))}%` }}
              title={marker.label ?? `Checkpoint at ${formatTime(marker.timeSeconds)}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
