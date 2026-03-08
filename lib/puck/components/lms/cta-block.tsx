import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

export type CtaBlockProps = {
  title: string
  subtitle: string
  primaryCtaLabel: string
  primaryCtaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  style: 'default' | 'gradient' | 'bordered'
} & SectionSpacingProps

const containerClasses: Record<string, string> = {
  default: 'bg-muted text-foreground',
  gradient: 'bg-primary text-primary-foreground',
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
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, title, subtitle, primaryCtaLabel, primaryCtaHref, secondaryCtaLabel, secondaryCtaHref, style: ctaStyle }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    const isGradient = ctaStyle === 'gradient'

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div
            className={cn(
              'px-8 py-12 rounded-2xl text-center',
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
                <a href={primaryCtaHref}>
                  <Button
                    size="lg"
                    variant={isGradient ? 'secondary' : 'default'}
                    className="h-12 px-8 text-base font-semibold rounded-xl"
                  >
                    {primaryCtaLabel}
                  </Button>
                </a>
              )}
              {secondaryCtaLabel && (
                <a href={secondaryCtaHref}>
                  <Button
                    size="lg"
                    variant="outline"
                    className={cn(
                      'h-12 px-8 text-base font-semibold rounded-xl',
                      isGradient && 'border-white/30 text-white hover:bg-white/10 hover:text-white'
                    )}
                  >
                    {secondaryCtaLabel}
                  </Button>
                </a>
              )}
            </div>}
          </div>
        </div>
      </div>
    )
  },
}
