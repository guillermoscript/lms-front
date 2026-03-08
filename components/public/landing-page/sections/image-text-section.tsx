import type { ImageTextSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: ImageTextSectionData
  colors?: SectionColors
}

export function ImageTextSection({ data, colors }: Props) {
  const imageRight = data.imagePosition !== 'left'
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'

  return (
    <div>
      <div className="container mx-auto px-4 md:px-6">
        <div className={`grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto ${imageRight ? '' : 'flex-row-reverse'}`}>
          <div className={`space-y-4 ${!imageRight ? 'md:order-2' : ''}`}>
            {data.title && (
              <h2 className={`text-3xl md:text-4xl font-bold ${headingColor}`}>{data.title}</h2>
            )}
            {data.content && (
              <p className={`${bodyColor} leading-relaxed text-lg`}>{data.content}</p>
            )}
          </div>
          {data.imageSrc && (
            <div className={`rounded-2xl overflow-hidden ${!imageRight ? 'md:order-1' : ''}`}>
              <img
                src={data.imageSrc}
                alt={data.imageAlt || ''}
                className="w-full h-auto object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
