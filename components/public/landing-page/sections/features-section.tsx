import type { FeaturesSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: FeaturesSectionData
}

export function FeaturesSection({ data }: Props) {
  const colClass = data.columns === 2 ? 'md:grid-cols-2' : data.columns === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'

  return (
    <section className="py-20 bg-zinc-900/20">
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            {data.title && <h2 className="text-3xl md:text-4xl font-bold text-white">{data.title}</h2>}
            {data.subtitle && <p className="text-zinc-400 text-lg">{data.subtitle}</p>}
          </div>
        )}
        <div className={`grid grid-cols-1 ${colClass} gap-6 max-w-5xl mx-auto`}>
          {(data.items ?? []).map((item, idx) => (
            <div key={idx} className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-2xl">
              {item.icon && <div className="text-3xl mb-4">{item.icon}</div>}
              <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
