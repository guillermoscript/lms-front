import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type HeroBlockProps = {
  title: string
  subtitle: string
  primaryCtaLabel: string
  primaryCtaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  backgroundImage: string
  alignment: 'left' | 'center' | 'right'
  overlayOpacity: number
  minHeight: string
}

const minHeightClasses: Record<string, string> = {
  auto: 'min-h-0',
  '400px': 'min-h-[400px]',
  '500px': 'min-h-[500px]',
  '600px': 'min-h-[600px]',
  '100vh': 'min-h-screen',
}

const alignmentTextClasses: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

const alignmentJustifyClasses: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

export const HeroBlock: ComponentConfig<HeroBlockProps> = {
  label: 'Hero',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    primaryCtaLabel: { type: 'text', label: 'Primary Button Label' },
    primaryCtaHref: { type: 'text', label: 'Primary Button URL' },
    secondaryCtaLabel: { type: 'text', label: 'Secondary Button Label' },
    secondaryCtaHref: { type: 'text', label: 'Secondary Button URL' },
    backgroundImage: { type: 'text', label: 'Background Image URL' },
    alignment: {
      type: 'radio',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
    },
    overlayOpacity: { type: 'number', label: 'Overlay Opacity (%)', min: 0, max: 100 },
    minHeight: {
      type: 'select',
      label: 'Min Height',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: 'Medium (400px)', value: '400px' },
        { label: 'Large (500px)', value: '500px' },
        { label: 'XL (600px)', value: '600px' },
        { label: 'Full Screen', value: '100vh' },
      ],
    },
  },
  defaultProps: {
    title: 'Welcome to Our Academy',
    subtitle: 'Start your learning journey today with expert-led courses designed to help you succeed.',
    primaryCtaLabel: 'Get Started',
    primaryCtaHref: '/courses',
    secondaryCtaLabel: 'Learn More',
    secondaryCtaHref: '#features',
    backgroundImage: '',
    alignment: 'center',
    overlayOpacity: 50,
    minHeight: '500px',
  },
  render: ({
    title, subtitle, primaryCtaLabel, primaryCtaHref,
    secondaryCtaLabel, secondaryCtaHref, backgroundImage,
    alignment, overlayOpacity, minHeight,
  }) => {
    return (
      <section
        className={cn(
          'relative flex items-center px-6 py-16',
          minHeightClasses[minHeight] || 'min-h-[500px]',
          backgroundImage ? 'bg-cover bg-center' : 'bg-primary',
          'text-primary-foreground'
        )}
        style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
      >
        {backgroundImage && overlayOpacity > 0 && (
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity / 100})` }}
          />
        )}
        <div
          className={cn(
            'relative mx-auto w-full max-w-7xl',
            alignmentTextClasses[alignment]
          )}
        >
          <h1
            className={cn(
              'text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6 break-words',
              alignment === 'center' ? 'max-w-[800px] mx-auto' : 'max-w-[600px]'
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={cn(
                'text-base md:text-lg lg:text-xl opacity-90 max-w-[640px] leading-relaxed mb-8',
                alignment === 'center' ? 'mx-auto' : ''
              )}
            >
              {subtitle}
            </p>
          )}
          <div className={cn('flex gap-4 flex-wrap', alignmentJustifyClasses[alignment])}>
            {primaryCtaLabel && (
              <a href={primaryCtaHref}>
                <Button
                  size="lg"
                  variant="secondary"
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
                  className="h-12 px-8 text-base font-semibold rounded-xl border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
                >
                  {secondaryCtaLabel}
                </Button>
              </a>
            )}
          </div>
        </div>
      </section>
    )
  },
}
