import type { TextSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: TextSectionData
  colors?: SectionColors
}

export function TextSection({ data, colors }: Props) {
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'

  return (
    <div>
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          {data.title && (
            <h2 className={`text-3xl md:text-4xl font-bold ${headingColor} mb-6`}>{data.title}</h2>
          )}
          {data.content && (
            <div className={`prose max-w-none leading-relaxed ${bodyColor}`}>
              {data.content.split('\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
