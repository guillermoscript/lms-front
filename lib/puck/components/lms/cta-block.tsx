import { ButtonLink } from '../../utils/button-link'
import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterProps, sectionInnerProps } from '../../utils/section-spacing'
import { accentColorField, accentVars } from '../../utils/accent-color'

export type CtaBlockProps = {
  title: string
  subtitle: string
  primaryCtaLabel: string
  primaryCtaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  style: 'default' | 'gradient' | 'bordered'
  accentColor: string
} & SectionSpacingProps

const containerClasses: Record<string, string> = {
  default: 'bg-muted text-foreground',
  gradient: 'bg-[var(--block-accent)] text-[var(--block-accent-foreground)]',
  bordered: 'border-2 border-border text-foreground',
}

export const CtaBlock: ComponentConfig<CtaBlockProps> = {
  label: 'CTA Block',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    primaryCtaLabel: { type: 'text', label: 'Primary Button Label' },
    primaryCtaHref: { type: 'text', label: 'Primary Button URL' },
    secondaryCtaLabel: { type: 'text', label: 'Secondary Button Label' },
    secondaryCtaHref: { type: 'text', label: 'Secondary Button URL' },
    style: {
      type: 'select',
      label: 'Style',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Gradient', value: 'gradient' },
        { label: 'Bordered', value: 'bordered' },
      ],
    },
    accentColor: accentColorField,
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'Ready to Start Learning?',
    subtitle: 'Join thousands of students and start your journey today.',
    primaryCtaLabel: 'Get Started',
    primaryCtaHref: '/courses',
    secondaryCtaLabel: '',
    secondaryCtaHref: '',
    style: 'gradient',
    accentColor: '',
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, title, subtitle, primaryCtaLabel, primaryCtaHref, secondaryCtaLabel, secondaryCtaHref, style: ctaStyle, accentColor }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    const isGradient = ctaStyle === 'gradient'

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing, accentVars(accentColor))}>
          <div
            className={cn(
              'px-8 py-12 rounded-card text-center',
              containerClasses[ctaStyle]
            )}
          >
            <h2 className="text-3xl font-bold mb-3 break-words">{title}</h2>
            {subtitle && (
              <p className="opacity-85 text-lg max-w-[640px] mx-auto mb-8 leading-relaxed">
                {subtitle}
              </p>
            )}
            {(primaryCtaLabel || secondaryCtaLabel) && <div className="flex gap-4 justify-center flex-wrap">
              {primaryCtaLabel && (
                <ButtonLink href={primaryCtaHref} size="lg"
                    variant={isGradient ? 'secondary' : 'default'}
                    className="h-12 px-8 text-base font-semibold"
                  >
                    {primaryCtaLabel}
                  </ButtonLink>
              )}
              {secondaryCtaLabel && (
                <ButtonLink href={secondaryCtaHref} size="lg"
                    variant="outline"
                    className={cn(
                      'h-12 px-8 text-base font-semibold',
                      // #569: this outline button sits directly on the accent
                      // surface, so its border and hover wash follow the same
                      // derived foreground — a hardcoded white one disappears
                      // against a pale accent.
                      isGradient &&
                        'border-[var(--block-accent-foreground)]/30 text-[var(--block-accent-foreground)] hover:bg-[var(--block-accent-foreground)]/10 hover:text-[var(--block-accent-foreground)]'
                    )}
                  >
                    {secondaryCtaLabel}
                  </ButtonLink>
              )}
            </div>}
          </div>
        </div>
      </div>
    )
  },
}
