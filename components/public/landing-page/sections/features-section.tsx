import type { FeaturesSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: FeaturesSectionData
  accentColor?: string
  colors?: SectionColors
}

export function FeaturesSection({ data, colors }: Props) {
  const colClass = data.columns === 2 ? 'md:grid-cols-2' : data.columns === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'
  const cardBg = colors?.cardBg ?? 'bg-zinc-900/40'
  const cardBorder = colors?.cardBorder ?? 'border-zinc-800/50'

  return (
    <div>
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            {data.title && <h2 className={`text-3xl md:text-4xl font-bold ${headingColor}`}>{data.title}</h2>}
            {data.subtitle && <p className={`${bodyColor} text-lg`}>{data.subtitle}</p>}
          </div>
        )}
        <div className={`grid grid-cols-1 ${colClass} gap-6 max-w-5xl mx-auto`}>
          {(data.items ?? []).map((item, idx) => (
            <div key={idx} className={`${cardBg} border ${cardBorder} p-6 rounded-2xl`}>
              {item.icon && <div className="text-3xl mb-4">{item.icon}</div>}
              <h3 className={`text-lg font-bold ${headingColor} mb-2`}>{item.title}</h3>
              <p className={`${bodyColor} text-sm leading-relaxed`}>{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
