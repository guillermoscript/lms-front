'use client'

import { useRef, useState } from 'react'
import { MDXClient, type SerializeResult } from 'next-mdx-remote-client'
import { lessonMdxComponents } from '@/components/lesson/mdx-components'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import {
  CheckpointVideoPlayer,
  getVideoProvider,
  type CheckpointVideoMarker,
  type CheckpointVideoPlayerHandle,
} from '@/components/lesson/checkpoint-video-player'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useCheckpoints } from '@/components/lesson/checkpoints/checkpoints-provider'
import { CheckpointExerciseRenderer } from '@/components/lesson/checkpoints/checkpoint-exercise-renderer'

interface LessonContentProps {
  mdx: SerializeResult | null
  videoUrl: string | null
  embedCode: string | null
}

export function LessonContent({ mdx, videoUrl, embedCode }: LessonContentProps) {
  const t = useTranslations('components.lessons')
  const tc = useTranslations('components.checkpoints')
  const checkpointsCtx = useCheckpoints()
  const playerRef = useRef<CheckpointVideoPlayerHandle>(null)
  const [activeMarker, setActiveMarker] = useState<CheckpointVideoMarker | null>(null)

  const getEmbedUrl = (url: string): string | null => {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
    const vimeoMatch = url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/)
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    return null
  }

  const videoMarkers: CheckpointVideoMarker[] = checkpointsCtx
    ? checkpointsCtx.checkpoints
        .filter((cp) => cp.placementType === 'video' && cp.videoTimestampSeconds !== null)
        .map((cp) => ({
          checkpointId: cp.id,
          timeSeconds: cp.videoTimestampSeconds as number,
          completed: cp.latestAttempt?.completed === true,
          allowSkip: cp.allowSkip,
          label: cp.label ?? undefined,
        }))
    : []

  const videoProvider = videoUrl ? getVideoProvider(videoUrl) : null
  const useCheckpointPlayer = videoUrl !== null && videoMarkers.length > 0 && videoProvider !== null

  const videoEmbedUrl = !useCheckpointPlayer && videoUrl ? getEmbedUrl(videoUrl) : null
  const hasError = mdx !== null && 'error' in mdx
  const hasCompiledSource = mdx !== null && 'compiledSource' in mdx

  const activeCheckpoint =
    activeMarker && checkpointsCtx ? checkpointsCtx.getCheckpoint(activeMarker.checkpointId) : undefined

  function handleMarkerReached(marker: CheckpointVideoMarker) {
    setActiveMarker(marker)
  }

  function handleDialogOpenChange(open: boolean) {
    if (open || !activeMarker) return
    const nowCompleted =
      checkpointsCtx?.getCheckpoint(activeMarker.checkpointId)?.latestAttempt?.completed === true
    if (activeMarker.allowSkip || nowCompleted) {
      playerRef.current?.resume()
      setActiveMarker(null)
    }
    // Otherwise ignore the dismiss attempt — a required, non-skippable
    // checkpoint must be completed before the video can resume.
  }

  return (
    <div className="space-y-8">
      {/* Video with in-player checkpoints */}
      {useCheckpointPlayer && videoUrl && (
        <CheckpointVideoPlayer
          url={videoUrl}
          markers={videoMarkers}
          onMarkerReached={handleMarkerReached}
          playerRef={playerRef}
          className="rounded-xl overflow-hidden shadow-lg ring-1 ring-border"
        />
      )}

      {/* Plain video embed (no video checkpoints on this lesson) */}
      {!useCheckpointPlayer && videoEmbedUrl && (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-border">
          <iframe
            src={videoEmbedUrl}
            title="Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}

      {/* Custom embed code */}
      {embedCode && !videoEmbedUrl && !useCheckpointPlayer && (
        <div
          className="aspect-video w-full overflow-hidden rounded-xl shadow-lg"
          dangerouslySetInnerHTML={{ __html: embedCode }}
        />
      )}

      {/* MDX content */}
      {mdx && (
        <article className="prose prose-neutral dark:prose-invert max-w-none! break-words prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-xl sm:prose-h1:text-2xl prose-h2:text-lg sm:prose-h2:text-xl prose-h3:text-base sm:prose-h3:text-lg prose-p:leading-[1.8] prose-p:text-foreground/80 prose-li:text-foreground/80 prose-pre:bg-[#1e1e2e] prose-pre:border prose-pre:border-white/5 prose-pre:rounded-xl prose-pre:shadow-md prose-pre:overflow-x-auto prose-pre:text-[13px] sm:prose-pre:text-sm prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] sm:prose-code:text-sm prose-code:font-medium prose-img:rounded-xl prose-img:shadow-lg prose-img:max-w-full prose-blockquote:border-primary/30 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-hr:border-border [&_table]:block [&_table]:overflow-x-auto">
          {hasError && 'error' in mdx && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
              <p className="font-semibold text-sm">{t('contentError')}</p>
              <p className="text-xs mt-1 opacity-80">{mdx.error.message}</p>
            </div>
          )}

          {hasCompiledSource && 'compiledSource' in mdx && (
            <MDXClient
              compiledSource={mdx.compiledSource}
              scope={mdx.scope}
              components={lessonMdxComponents}
            />
          )}
        </article>
      )}

      {!mdx && !videoEmbedUrl && !embedCode && !useCheckpointPlayer && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
            <IconPlayerPlay className="h-5 w-5 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            {t('noContent')}
          </p>
        </div>
      )}

      {/* Video checkpoint dialog — opened when the player pauses at an uncompleted marker */}
      <Dialog open={activeMarker !== null} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeCheckpoint?.label || activeCheckpoint?.exercise.title || tc('checkpoint')}
            </DialogTitle>
            <DialogDescription>{tc('videoCheckpointDescription')}</DialogDescription>
          </DialogHeader>
          {activeCheckpoint && <CheckpointExerciseRenderer checkpoint={activeCheckpoint} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
