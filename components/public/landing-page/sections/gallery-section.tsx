import type { GallerySectionData } from '@/lib/landing-pages/types'

interface Props {
  data: GallerySectionData
}

export function GallerySection({ data }: Props) {
  const colsClass =
    data.columns === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    data.columns === 4 ? 'grid-cols-2 md:grid-cols-4' :
    'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center mb-12">
            {data.title && (
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">{data.title}</h2>
            )}
            {data.subtitle && (
              <p className="text-zinc-400 max-w-2xl mx-auto">{data.subtitle}</p>
            )}
          </div>
        )}
        <div className={`grid ${colsClass} gap-4`}>
          {data.items?.map((item, idx) => (
            <div key={idx} className="group relative overflow-hidden rounded-xl bg-zinc-900 aspect-[4/3]">
              {item.src ? (
                <img
                  src={item.src}
                  alt={item.alt || ''}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  <span className="text-sm">{item.alt || 'No image'}</span>
                </div>
              )}
              {item.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-sm text-white">{item.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
