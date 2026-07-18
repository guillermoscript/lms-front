import type { ComponentConfig } from '@measured/puck'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'

export type ContentFeatureProps = {
  heading: string
  body: string
  imageUrl: string
  imageAlt: string
  imagePosition: 'left' | 'right'
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
    quote:
      'Switching to this platform cut our course setup time in half and our completion rates went up.',
    quoteAuthor: 'Jane Doe, Course Creator',
  },
  render: ({
    paddingY,
    paddingX,
    maxWidth,
    marginY,
    heading,
    body,
    imageUrl,
    imageAlt,
    imagePosition,
    quote,
    quoteAuthor,
  }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    const image = imageUrl ? (
      <div className="relative mb-6 sm:mb-0">
        <div className="aspect-76/59 relative rounded-2xl bg-gradient-to-b from-muted to-transparent p-px">
          <img src={imageUrl} alt={imageAlt} className="rounded-[15px] shadow" loading="lazy" />
        </div>
      </div>
    ) : null

    const textCol = (
      <div className="relative space-y-4">
        {body && <p className="text-muted-foreground whitespace-pre-line">{body}</p>}
        {quote && (
          <div className="pt-6">
            <blockquote className="border-l-4 pl-4">
              <p>{quote}</p>
              {quoteAuthor && <cite className="mt-6 block font-medium">{quoteAuthor}</cite>}
            </blockquote>
          </div>
        )}
      </div>
    )

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="space-y-8 md:space-y-16">
            {heading && (
              <h2 className="relative z-10 max-w-xl text-4xl font-medium lg:text-5xl">{heading}</h2>
            )}
            <div className="grid gap-6 sm:grid-cols-2 md:gap-12 lg:gap-24">
              {imagePosition === 'left' ? (
                <>
                  {image}
                  {textCol}
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
      </div>
    )
  },
}
