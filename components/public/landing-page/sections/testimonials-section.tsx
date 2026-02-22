import type { TestimonialsSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: TestimonialsSectionData
}

export function TestimonialsSection({ data }: Props) {
  return (
    <section className="py-20 bg-zinc-900/20">
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            {data.title && <h2 className="text-3xl md:text-4xl font-bold text-white">{data.title}</h2>}
            {data.subtitle && <p className="text-zinc-400 text-lg">{data.subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {(data.items ?? []).map((item, idx) => (
            <blockquote key={idx} className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6 space-y-4">
              <p className="text-zinc-300 leading-relaxed italic">"{item.quote}"</p>
              <footer className="flex items-center gap-3">
                {item.avatar ? (
                  <img src={item.avatar} alt={item.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 font-bold text-sm">
                    {item.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-white font-semibold text-sm">{item.name}</p>
                  <p className="text-zinc-500 text-xs">{item.role}</p>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  )
}
