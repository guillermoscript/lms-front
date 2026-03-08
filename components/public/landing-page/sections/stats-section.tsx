import type { StatsSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: StatsSectionData
  colors?: SectionColors
}

export function StatsSection({ data, colors }: Props) {
  const headingColor = colors?.heading ?? 'text-white'
  const mutedColor = colors?.muted ?? 'text-zinc-500'

  return (
    <div>
      <div className="container mx-auto px-4 md:px-6">
        {data.title && (
          <h2 className={`text-center text-2xl font-bold ${headingColor} mb-8`}>{data.title}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 justify-items-center">
          {(data.items ?? []).map((stat, idx) => (
            <div key={idx} className="text-center">
              <div className={`text-3xl font-black ${headingColor} mb-1 tabular-nums`}>{stat.value}</div>
              <div className={`text-sm ${mutedColor} font-medium tracking-wide uppercase`}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
