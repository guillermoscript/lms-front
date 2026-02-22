import type { TeamSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: TeamSectionData
}

export function TeamSection({ data }: Props) {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            {data.title && <h2 className="text-3xl md:text-4xl font-bold text-white">{data.title}</h2>}
            {data.subtitle && <p className="text-zinc-400 text-lg">{data.subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {(data.items ?? []).map((member, idx) => (
            <div key={idx} className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 text-center space-y-3">
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="w-16 h-16 rounded-full mx-auto object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-zinc-700 mx-auto flex items-center justify-center text-zinc-400 font-bold text-xl">
                  {member.name.charAt(0)}
                </div>
              )}
              <div>
                <p className="font-bold text-white">{member.name}</p>
                <p className="text-zinc-400 text-sm">{member.role}</p>
              </div>
              {member.bio && <p className="text-zinc-500 text-sm leading-relaxed">{member.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
