import type { ComponentConfig } from '@measured/puck'
import { BlockIcon } from '../../utils/block-icon'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../utils/section-spacing'

export type ContentFeatureProps = {
  heading: string
  body: string
  imageUrl: string
  imageAlt: string
  imagePosition: 'left' | 'right'
  bullets: string
  quote: string
  quoteAuthor: string
} & SectionSpacingProps

/**
 * Puck wrapper for the Tailark `content-1` block (installed to components/content-1.tsx via
 * `npx shadcn add @tailark/content-1`). Pattern B with a dependency fix: the Tailark source
 * imports a `Spotify` brand SVG and next/image with bundled assets that don't exist here.
 * The wrapper drops those, uses a plain editable <img>, and exposes the heading, body, image
 * side, and optional pull-quote as fields. components/content-1.tsx is kept as the reference.
 */
export const ContentFeature: ComponentConfig<ContentFeatureProps> = {
  label: 'Content Feature',
  fields: {
    heading: { type: 'text', label: 'Heading' },
    body: { type: 'textarea', label: 'Body' },
    imageUrl: { type: 'text', label: 'Image URL' },
    imageAlt: { type: 'text', label: 'Image Alt Text' },
    imagePosition: {
      type: 'radio',
      label: 'Image Position',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Right', value: 'right' },
      ],
    },
    bullets: { type: 'textarea', label: 'Bullets (one per line)' },
    quote: { type: 'textarea', label: 'Pull Quote' },
    quoteAuthor: { type: 'text', label: 'Quote Author' },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    heading: 'Everything you need to teach online',
    body: 'Build courses, track learner progress, run assessments, and issue certificates — all from one platform designed to get out of your way.',
    imageUrl: 'https://placehold.co/1207x929/e2e8f0/64748b?text=Feature',
    imageAlt: 'Product feature illustration',
    imagePosition: 'left',
    bullets: '',
    quote: '',
    quoteAuthor: '',
  },
  render: ({
    paddingY,
    paddingX,
    maxWidth,
    marginY,
    tone,
    align,
    anchorId,
    hideOn,
    heading,
    body,
    imageUrl,
    imageAlt,
    imagePosition,
    bullets,
    quote,
    quoteAuthor,
  }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    const points = (bullets ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    const image = imageUrl ? (
      <div className="overflow-hidden rounded-card border border-border">
        <img src={imageUrl} alt={imageAlt} className="aspect-[4/3] w-full object-cover" loading="lazy" />
      </div>
    ) : null

    const textCol = (
      <div className="space-y-5">
        {heading && (
          <h2 className="text-3xl font-semibold tracking-tight text-balance break-words md:text-4xl">
            {heading}
          </h2>
        )}
        {body && (
          <p className="text-lg leading-relaxed text-muted-foreground whitespace-pre-line text-pretty">{body}</p>
        )}
        {points.length > 0 && (
          <ul className="space-y-3 pt-1">
            {points.map((p, i) => (
              <li key={i} className="flex gap-3">
                <BlockIcon name="check" className="mt-1 size-4 shrink-0 text-[var(--block-accent,var(--primary))]" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        {quote && (
          <blockquote className="border-l-2 border-border pl-4 pt-1">
            <p>{quote}</p>
            {quoteAuthor && <cite className="mt-3 block text-sm font-medium not-italic">{quoteAuthor}</cite>}
          </blockquote>
        )}
      </div>
    )

    const left = imagePosition === 'left'
    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing)}>
          <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12 lg:gap-20">
            {left ? (
              <>
                {image && <div className="order-2 md:order-1">{image}</div>}
                <div className="order-1 md:order-2">{textCol}</div>
              </>
            ) : (
              <>
                {textCol}
                {image}
              </>
            )}
          </div>
        </div>
      </div>
    )
  },
}
