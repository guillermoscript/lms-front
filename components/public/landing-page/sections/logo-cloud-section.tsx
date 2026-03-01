import type { LogoCloudSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: LogoCloudSectionData
}

export function LogoCloudSection({ data }: Props) {
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
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {data.items?.map((item, idx) => {
            const content = item.logoUrl ? (
              <img
                src={item.logoUrl}
                alt={item.name}
                className="h-8 md:h-10 w-auto object-contain grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300"
              />
            ) : (
              <span className="text-lg font-semibold text-zinc-500 hover:text-white transition-colors">
                {item.name}
              </span>
            )

            if (item.href) {
              return (
                <a key={idx} href={item.href} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              )
            }
            return <div key={idx}>{content}</div>
          })}
        </div>
      </div>
    </section>
  )
}
