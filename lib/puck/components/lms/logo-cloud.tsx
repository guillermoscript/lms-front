import type { ComponentConfig } from '@measured/puck'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type LogoItem = {
  src: string
  alt: string
  url: string
}

export type LogoCloudProps = {
  title: string
  items: LogoItem[]
} & SectionSpacingProps

export const LogoCloud: ComponentConfig<LogoCloudProps> = {
  label: 'Logo Cloud',
  fields: {
    title: { type: 'text', label: 'Title' },
    items: {
      type: 'array',
      label: 'Logos',
      arrayFields: {
        src: { type: 'text', label: 'Image URL' },
        alt: { type: 'text', label: 'Alt Text' },
        url: { type: 'text', label: 'Link URL' },
      },
      defaultItemProps: { src: 'https://placehold.co/120x40/e2e8f0/64748b?text=Logo', alt: 'Logo', url: '' },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'Trusted By',
    items: Array.from({ length: 5 }, (_, i) => ({
      src: `https://placehold.co/120x40/e2e8f0/94a3b8?text=Brand+${i + 1}`,
      alt: `Brand ${i + 1}`,
      url: '',
    })),
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, title, items }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!items.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="text-center">
            {title && (
              <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-8">
                {title}
              </p>
            )}
            <div className="flex flex-wrap justify-center items-center gap-10">
              {items.map((logo, i) => {
                const img = (
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    loading="lazy"
                    className="h-10 object-contain opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-105"
                  />
                )
                return logo.url ? (
                  <a
                    key={i}
                    href={logo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-all duration-300"
                  >
                    {img}
                  </a>
                ) : (
                  <span key={i} className="inline-block">{img}</span>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
