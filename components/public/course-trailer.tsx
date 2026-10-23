'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CourseCover } from '@/components/public/course-cover'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { resolveVideoEmbed, VIDEO_IFRAME_ALLOW } from '@/lib/video/embed'
import { lessonThumbnail } from '@/lib/lessons/video-thumbnail'

interface CourseTrailerProps {
  title: string
  trailerUrl: string
  thumbnailUrl: string | null
  category?: string | null
}

const DIRECT_VIDEO = /\.(mp4|webm|ogg|mov)(\?|#|$)/i

/**
 * Course cover that doubles as the trailer: a play button over the cover opens
 * the intro video in a dialog, so visitors can see what the course covers
 * before enrolling. Without a playable trailer it is just the cover.
 */
export function CourseTrailer({ title, trailerUrl, thumbnailUrl, category }: CourseTrailerProps) {
  const t = useTranslations('coursePublicDetails.trailer')
  const [open, setOpen] = useState(false)

  const embed = resolveVideoEmbed(trailerUrl)
  const isDirect = !embed && /^https?:\/\//i.test(trailerUrl) && DIRECT_VIDEO.test(trailerUrl)
  const cover =
    thumbnailUrl ?? lessonThumbnail({ image: null, video_url: trailerUrl })

  if (!embed && !isDirect) {
    return <CourseCover title={title} thumbnailUrl={thumbnailUrl} category={category} />
  }

  const src = embed
    ? `${embed.embedUrl}${embed.embedUrl.includes('?') ? '&' : '?'}autoplay=1`
    : trailerUrl

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="course-trailer-button"
        aria-label={t('watch')}
        className="group relative block w-full text-left"
      >
        <CourseCover title={title} thumbnailUrl={cover} category={category} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors duration-150 group-hover:bg-black/35">
          <span className="flex items-center gap-2 rounded-full bg-background/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg">
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            {t('watch')}
          </span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden gap-0">
          <DialogTitle className="sr-only">{t('title', { title })}</DialogTitle>
          {open && (
            <div className="aspect-video w-full bg-black">
              {embed ? (
                <iframe
                  src={src}
                  title={t('title', { title })}
                  allow={VIDEO_IFRAME_ALLOW}
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : (
                <video src={src} controls autoPlay playsInline className="h-full w-full" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
