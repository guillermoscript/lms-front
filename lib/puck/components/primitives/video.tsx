import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

export type VideoProps = {
  url: string
  title: string
  aspectRatio: '16/9' | '4/3' | '1/1'
  borderRadius: string
}

// Convert YouTube/Vimeo URLs to embed URLs
function getEmbedUrl(url: string): string {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/
  )
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return url
}

const aspectRatioMap: Record<string, string> = {
  '16/9': 'aspect-video',
  '4/3': 'aspect-[4/3]',
  '1/1': 'aspect-square',
}

const borderRadiusMap: Record<string, string> = {
  '0': 'rounded-none',
  '0.5rem': 'rounded-lg',
  '1rem': 'rounded-2xl',
  '1.5rem': 'rounded-3xl',
}

export const Video: ComponentConfig<VideoProps> = {
  label: 'Video',
  fields: {
    url: { type: 'text', label: 'Video URL (YouTube or Vimeo)' },
    title: { type: 'text', label: 'Title' },
    aspectRatio: {
      type: 'select',
      label: 'Aspect Ratio',
      options: [
        { label: '16:9', value: '16/9' },
        { label: '4:3', value: '4/3' },
        { label: '1:1', value: '1/1' },
      ],
    },
    borderRadius: {
      type: 'select',
      label: 'Border Radius',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '0.5rem' },
        { label: 'Large', value: '1rem' },
        { label: 'XL', value: '1.5rem' },
      ],
    },
  },
  defaultProps: {
    url: '',
    title: 'Video',
    aspectRatio: '16/9',
    borderRadius: '0.5rem',
  },
  render: ({ url, title, aspectRatio, borderRadius }) => {
    if (!url) {
      return (
        <div
          className={cn(
            'flex items-center justify-center bg-muted text-sm text-muted-foreground',
            aspectRatioMap[aspectRatio] || 'aspect-video',
            borderRadiusMap[borderRadius] || 'rounded-lg',
          )}
        >
          Paste a YouTube or Vimeo URL
        </div>
      )
    }
    return (
      <div
        className={cn(
          'overflow-hidden',
          aspectRatioMap[aspectRatio] || 'aspect-video',
          borderRadiusMap[borderRadius] || 'rounded-lg',
        )}
      >
        <iframe
          src={getEmbedUrl(url)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-none"
        />
      </div>
    )
  },
}
