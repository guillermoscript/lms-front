import type { VideoSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: VideoSectionData
  colors?: SectionColors
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return url
}

export function VideoSection({ data, colors }: Props) {
  const embedUrl = getEmbedUrl(data.videoUrl ?? '')
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'
  const cardBorder = colors?.cardBorder ?? 'border-zinc-800'

  return (
    <div>
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-3">
            {data.title && <h2 className={`text-3xl md:text-4xl font-bold ${headingColor}`}>{data.title}</h2>}
            {data.subtitle && <p className={`${bodyColor} text-lg`}>{data.subtitle}</p>}
          </div>
        )}
        {embedUrl && (
          <div className={`max-w-3xl mx-auto aspect-video rounded-2xl overflow-hidden bg-zinc-900 border ${cardBorder}`}>
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={data.title || 'Video'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
