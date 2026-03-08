import type { TeamSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: TeamSectionData
  colors?: SectionColors
}

export function TeamSection({ data, colors }: Props) {
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'
  const mutedColor = colors?.muted ?? 'text-zinc-500'
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {(data.items ?? []).map((member, idx) => (
            <div key={idx} className={`${cardBg} border ${cardBorder} rounded-2xl p-6 text-center space-y-3`}>
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="w-16 h-16 rounded-full mx-auto object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-zinc-700 mx-auto flex items-center justify-center text-zinc-400 font-bold text-xl">
                  {member.name.charAt(0)}
                </div>
              )}
              <div>
                <p className={`font-bold ${headingColor}`}>{member.name}</p>
                <p className={`${bodyColor} text-sm`}>{member.role}</p>
              </div>
              {member.bio && <p className={`${mutedColor} text-sm leading-relaxed`}>{member.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
