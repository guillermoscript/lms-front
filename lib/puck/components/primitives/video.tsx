import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { getEmbedUrl, VIDEO_IFRAME_ALLOW } from '@/lib/video/embed'

export type VideoProps = {
  url: string
  title: string
  aspectRatio: '16/9' | '4/3' | '1/1'
  borderRadius: string
}

// Known platforms and pasted iframe snippets resolve via the shared helper;
// anything else keeps the legacy behavior (use the URL as the iframe src).
function toEmbedSrc(url: string): string {
  const embed = getEmbedUrl(url)
  if (embed) return embed
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : ''
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
    url: { type: 'text', label: 'Video URL or embed code (YouTube, Vimeo, Loom, Cap…)' },
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
        { label: 'School theme', value: 'school' },
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
    borderRadius: 'school',
  },
  render: ({ url, title, aspectRatio, borderRadius }) => {
    if (!url) {
      return (
        <div
          className={cn(
            'flex items-center justify-center bg-muted text-sm text-muted-foreground',
            aspectRatioMap[aspectRatio] || 'aspect-video',
            borderRadiusMap[borderRadius] || 'rounded-card',
          )}
        >
          Paste a video URL or embed code
        </div>
      )
    }
    return (
      <div
        className={cn(
          'overflow-hidden',
          aspectRatioMap[aspectRatio] || 'aspect-video',
          borderRadiusMap[borderRadius] || 'rounded-card',
        )}
      >
        <iframe
          src={toEmbedSrc(url)}
          title={title}
          allow={VIDEO_IFRAME_ALLOW}
          allowFullScreen
          className="h-full w-full border-none"
        />
      </div>
    )
  },
}
