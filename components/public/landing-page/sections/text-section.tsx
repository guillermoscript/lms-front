import type { TextSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: TextSectionData
}

export function TextSection({ data }: Props) {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          {data.title && (
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">{data.title}</h2>
          )}
          {data.content && (
            <div className="prose prose-invert prose-zinc max-w-none leading-relaxed text-zinc-400">
              {data.content.split('\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
