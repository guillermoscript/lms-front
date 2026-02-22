import type { ImageTextSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: ImageTextSectionData
}

export function ImageTextSection({ data }: Props) {
  const imageRight = data.imagePosition !== 'left'

  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className={`grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto ${imageRight ? '' : 'flex-row-reverse'}`}>
          <div className={`space-y-4 ${!imageRight ? 'md:order-2' : ''}`}>
            {data.title && (
              <h2 className="text-3xl md:text-4xl font-bold text-white">{data.title}</h2>
            )}
            {data.content && (
              <p className="text-zinc-400 leading-relaxed text-lg">{data.content}</p>
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
    </section>
  )
}
