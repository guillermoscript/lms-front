import type { StatsSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: StatsSectionData
}

export function StatsSection({ data }: Props) {
  return (
    <section className="py-14 border-y border-white/5 bg-zinc-900/20">
      <div className="container mx-auto px-4 md:px-6">
        {data.title && (
          <h2 className="text-center text-2xl font-bold text-white mb-8">{data.title}</h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 justify-items-center">
          {(data.items ?? []).map((stat, idx) => (
            <div key={idx} className="text-center">
              <div className="text-3xl font-black text-white mb-1 tabular-nums">{stat.value}</div>
              <div className="text-sm text-zinc-500 font-medium tracking-wide uppercase">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
