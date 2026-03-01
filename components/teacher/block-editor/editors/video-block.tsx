'use client'

import type { VideoBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconVideo, IconAlertCircle } from '@tabler/icons-react'

interface VideoBlockEditorProps {
  block: VideoBlock
  onChange: (updates: Partial<VideoBlock>) => void
}

/**
 * Extract embed URL from a YouTube or Vimeo URL.
 * Returns null if the URL is not recognized.
 */
function getEmbedUrl(url: string): string | null {
  if (!url) return null

  // YouTube: https://www.youtube.com/watch?v=ID or https://youtu.be/ID
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`
  }

  // Vimeo: https://vimeo.com/ID or https://vimeo.com/channels/staffpicks/ID
  const vimeoMatch = url.match(/vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  return null
}

export function VideoBlockEditor({ block, onChange }: VideoBlockEditorProps) {
  const embedUrl = getEmbedUrl(block.url)
  const hasUrl = block.url.trim().length > 0
  const isInvalid = hasUrl && !embedUrl

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconVideo className="h-4 w-4 text-primary" />
        Video
      </div>
      <Input
        value={block.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="YouTube or Vimeo URL (e.g. https://www.youtube.com/watch?v=...)"
      />
      {isInvalid && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <IconAlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Unrecognized URL. Please use a YouTube or Vimeo link.</span>
        </div>
      )}
      {embedUrl && (
        <div className="mt-2 aspect-video overflow-hidden rounded-md bg-muted">
          <iframe
            src={embedUrl}
            className="h-full w-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            title="Video preview"
          />
        </div>
      )}
    </div>
  )
}
