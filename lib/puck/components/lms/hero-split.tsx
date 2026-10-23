import type { ComponentConfig } from '@measured/puck'
import { ButtonLink } from '../../utils/button-link'
import { BlockIcon } from '../../utils/block-icon'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../utils/section-spacing'

export type HeroSplitProps = {
  eyebrow: string
  title: string
  subtitle: string
  primaryCtaLabel: string
  primaryCtaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  imageUrl: string
  imageAlt: string
  imagePosition: 'left' | 'right'
  highlights: string
} & SectionSpacingProps

/**
 * Two-column hero: copy and CTAs on one side, a framed image on the other.
 * Stacks (copy first) below `lg`. `highlights` is one short proof point per line.
 */
export const HeroSplit: ComponentConfig<HeroSplitProps> = {
  label: 'Hero Split',
  fields: {
    eyebrow: { type: 'text', label: 'Eyebrow' },
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    primaryCtaLabel: { type: 'text', label: 'Primary Button Label' },
    primaryCtaHref: { type: 'text', label: 'Primary Button URL' },
    secondaryCtaLabel: { type: 'text', label: 'Secondary Button Label' },
    secondaryCtaHref: { type: 'text', label: 'Secondary Button URL' },
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
    highlights: { type: 'textarea', label: 'Highlights (one per line)' },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    paddingY: 'xl',
    eyebrow: '',
    title: 'Welcome to Our Academy',
    subtitle: 'Start your learning journey today with expert-led courses designed to help you succeed.',
    primaryCtaLabel: 'Get Started',
    primaryCtaHref: '/auth/sign-up',
    secondaryCtaLabel: 'Browse courses',
    secondaryCtaHref: '/courses',
    imageUrl: '',
    imageAlt: '',
    imagePosition: 'right',
    highlights: '',
  },
  render: ({
    paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn,
    eyebrow, title, subtitle, primaryCtaLabel, primaryCtaHref, secondaryCtaLabel,
    secondaryCtaHref, imageUrl, imageAlt, imagePosition, highlights,
  }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    const points = (highlights ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

    const copy = (
      <div className="flex flex-col items-start gap-6">
        {eyebrow && (
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        )}
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-balance break-words md:text-5xl lg:text-6xl">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">{subtitle}</p>
        )}
        {(primaryCtaLabel || secondaryCtaLabel) && (
          <div className="flex flex-wrap gap-3">
            {primaryCtaLabel && (
              <ButtonLink href={primaryCtaHref} size="lg" className="h-12 px-7 text-base font-semibold">
                {primaryCtaLabel}
              </ButtonLink>
            )}
            {secondaryCtaLabel && (
              <ButtonLink href={secondaryCtaHref} size="lg" variant="outline" className="h-12 px-7 text-base font-semibold">
                {secondaryCtaLabel}
              </ButtonLink>
            )}
          </div>
        )}
        {points.length > 0 && (
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {points.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <BlockIcon name="check" className="size-4 text-[var(--block-accent,var(--primary))]" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    )

    const media = imageUrl ? (
      <div className="overflow-hidden rounded-card border border-border">
        <img src={imageUrl} alt={imageAlt} className="aspect-[4/3] w-full object-cover" loading="eager" />
      </div>
    ) : null

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing)}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {imagePosition === 'left' ? (
              <>
                {media && <div className="order-2 lg:order-1">{media}</div>}
                <div className="order-1 lg:order-2">{copy}</div>
              </>
            ) : (
              <>
                {copy}
                {media}
              </>
            )}
          </div>
        </div>
      </div>
    )
  },
}
