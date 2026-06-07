import type { ComponentConfig } from '@measured/puck'
import { Marquee } from '@/components/ui/marquee'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'

type LogoItem = {
  src: string
  alt: string
  url: string
}

export type LogoMarqueeProps = {
  title: string
  items: LogoItem[]
  reverse: 'true' | 'false'
  pauseOnHover: 'true' | 'false'
} & SectionSpacingProps

/**
 * Puck wrapper around the Magic UI `Marquee` primitive (components/ui/marquee.tsx,
 * installed via `npx shadcn add @magicui/marquee`).
 *
 * The registry component takes `children` + behaviour props — none of which Puck can
 * edit directly. This wrapper exposes the marquee *content* as an editable array field
 * and the behaviour as radio fields, making it a drag-and-drop landing-page block.
 */
export const LogoMarquee: ComponentConfig<LogoMarqueeProps> = {
  label: 'Logo Marquee',
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
      defaultItemProps: {
        src: 'https://placehold.co/120x40/e2e8f0/64748b?text=Logo',
        alt: 'Logo',
        url: '',
      },
    },
    reverse: {
      type: 'radio',
      label: 'Direction',
      options: [
        { label: 'Left', value: 'false' },
        { label: 'Right', value: 'true' },
      ],
    },
    pauseOnHover: {
      type: 'radio',
      label: 'Pause on Hover',
      options: [
        { label: 'Yes', value: 'true' },
        { label: 'No', value: 'false' },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'Trusted By',
    reverse: 'false',
    pauseOnHover: 'true',
    items: Array.from({ length: 8 }, (_, i) => ({
      src: `https://placehold.co/120x40/e2e8f0/94a3b8?text=Brand+${i + 1}`,
      alt: `Brand ${i + 1}`,
      url: '',
    })),
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, title, items, reverse, pauseOnHover }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!items.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          {title && (
            <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-8">
              {title}
            </p>
          )}
          <div className="relative">
            <Marquee reverse={reverse === 'true'} pauseOnHover={pauseOnHover === 'true'}>
              {items.map((logo, i) => {
                const img = (
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    loading="lazy"
                    className="h-10 w-auto object-contain opacity-60 hover:opacity-100 transition-all duration-300"
                  />
                )
                return logo.url ? (
                  <a
                    key={i}
                    href={logo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-4 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {img}
                  </a>
                ) : (
                  <span key={i} className="mx-4 flex items-center">
                    {img}
                  </span>
                )
              })}
            </Marquee>
            {/* edge fade — standard marquee polish */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1/6 bg-gradient-to-r from-background" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/6 bg-gradient-to-l from-background" />
          </div>
        </div>
      </div>
    )
  },
}
