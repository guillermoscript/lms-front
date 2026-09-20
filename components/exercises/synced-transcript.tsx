'use client'

import { useMemo } from 'react'
import { Transcription, TranscriptionSegment } from '@/components/ai-elements/transcription'
import type { AnnotatedSegment } from '@/lib/speech/types'

/** The last word has no successor to end on. */
const LAST_SEGMENT_SECONDS = 0.6

/**
 * The recording's transcript, highlighted word by word as it plays; clicking a
 * word seeks the player there. Segments come from the STT word timestamps the
 * speech pipeline already stores in `annotated_transcript`.
 */
export function SyncedTranscript({
  segments,
  currentTime,
  onSeek,
}: {
  segments: AnnotatedSegment[]
  currentTime: number
  onSeek: (seconds: number) => void
}) {
  const timed = useMemo(() => {
    const withTime = segments.filter((s) => typeof s.timestamp_ms === 'number' && s.text.trim())
    return withTime.map((s, i) => {
      const startSecond = (s.timestamp_ms as number) / 1000
      const next = withTime[i + 1]
      return {
        text: s.text.trim(),
        type: s.type,
        startSecond,
        endSecond: next ? (next.timestamp_ms as number) / 1000 : startSecond + LAST_SEGMENT_SECONDS,
      }
    })
  }, [segments])

  if (timed.length === 0) return null

  return (
    <Transcription segments={timed} currentTime={currentTime} onSeek={onSeek}>
      {(segment, index) => (
        <TranscriptionSegment
          key={index}
          segment={segment}
          index={index}
          className={
            timed[index]?.type === 'filler'
              ? 'rounded bg-warning/15 font-medium text-warning'
              : timed[index]?.type === 'long_pause'
                ? 'italic'
                : undefined
          }
        />
      )}
    </Transcription>
  )
}
