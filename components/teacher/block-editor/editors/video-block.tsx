'use client'

import type { VideoBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconVideo } from '@tabler/icons-react'

interface VideoBlockEditorProps {
  block: VideoBlock
  onChange: (updates: Partial<VideoBlock>) => void
}

export function VideoBlockEditor({ block, onChange }: VideoBlockEditorProps) {
  // Extract video ID for preview
  const getYoutubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)
    return match?.[1]
  }

  const youtubeId = getYoutubeId(block.url)

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconVideo className="h-4 w-4 text-primary" />
        Video
      </div>
      <Input
        value={block.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="URL del video (YouTube, Vimeo, etc.)"
      />
      {youtubeId && (
        <div className="mt-2 aspect-video overflow-hidden rounded-md">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            className="h-full w-full"
            allowFullScreen
            title="Video preview"
          />
        </div>
      )}
    </div>
  )
}
