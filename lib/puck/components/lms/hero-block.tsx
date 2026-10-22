import { ButtonLink } from '../../utils/button-link'
import type { ComponentConfig } from '@measured/puck'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { accentColorField, accentVars } from '../../utils/accent-color'

export type HeroBlockProps = {
  title: string
  subtitle: string
  primaryCtaLabel: string
  primaryCtaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  backgroundImage: string
  backgroundColor: string
  alignment: 'left' | 'center' | 'right'
  overlayOpacity: number
  minHeight: string
  /** `brand` paints the accent (default); `theme` / `inverse` paint the school's own surface tokens. */
  surface: 'brand' | 'theme' | 'inverse'
  pattern: 'none' | 'grid' | 'dots'
  /** Optional terminal/chat card beside the copy; shown when `cardLines` is not empty. */
  cardTitle: string
  cardLines: { kind: 'prompt' | 'reply' | 'note'; text: string }[]
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

const surfaceClasses: Record<string, string> = {
  theme: 'bg-background text-foreground',
  inverse: 'bg-foreground text-background',
}

// Ink for the secondary button and card accents when the surface is a theme token, not the accent.
const surfaceInk: Record<string, string> = {
  theme: 'var(--foreground)',
  inverse: 'var(--background)',
}

const cardLineClasses: Record<string, string> = {
  prompt: 'text-muted-foreground',
  reply: 'text-[var(--block-accent)]',
  note: 'text-muted-foreground/70',
}

/** Faint grid / dot lattice drawn in the current text colour, so it reads on any surface. */
function patternStyle(pattern: string): CSSProperties | undefined {
  const line = 'color-mix(in srgb, currentColor 9%, transparent)'
  const mask = 'radial-gradient(ellipse at 70% 40%, #000 20%, transparent 75%)'
  if (pattern === 'grid') {
    return {
      backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      backgroundSize: '48px 48px',
      maskImage: mask,
      WebkitMaskImage: mask,
    }
  }
  if (pattern === 'dots') {
    return {
      backgroundImage: `radial-gradient(${line} 1.5px, transparent 1.5px)`,
      backgroundSize: '24px 24px',
      maskImage: mask,
      WebkitMaskImage: mask,
    }
  }
  return undefined
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
    backgroundColor: { ...accentColorField, label: 'Background Color' },
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
    surface: {
      type: 'select',
      label: 'Surface',
      options: [
        { label: 'Brand color', value: 'brand' },
        { label: 'Theme surface', value: 'theme' },
        { label: 'Inverse', value: 'inverse' },
      ],
    },
    pattern: {
      type: 'select',
      label: 'Background Pattern',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Grid', value: 'grid' },
        { label: 'Dots', value: 'dots' },
      ],
    },
    cardTitle: { type: 'text', label: 'Card Title (terminal/chat)' },
    cardLines: {
      type: 'array',
      label: 'Card Lines',
      arrayFields: {
        kind: {
          type: 'select',
          label: 'Kind',
          options: [
            { label: 'Prompt / input', value: 'prompt' },
            { label: 'Reply / result', value: 'reply' },
            { label: 'Note', value: 'note' },
          ],
        },
        text: { type: 'textarea', label: 'Text' },
      },
      defaultItemProps: { kind: 'prompt', text: '' },
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
    backgroundColor: '',
    alignment: 'center',
    overlayOpacity: 50,
    minHeight: '500px',
    surface: 'brand',
    pattern: 'none',
    cardTitle: '',
    cardLines: [],
  },
  render: ({
    title, subtitle, primaryCtaLabel, primaryCtaHref,
    secondaryCtaLabel, secondaryCtaHref, backgroundImage, backgroundColor,
    alignment, overlayOpacity, minHeight, surface = 'brand', pattern = 'none',
    cardTitle = '', cardLines = [],
  }) => {
    const themed = surface !== 'brand' && !backgroundImage
    const lines = (cardLines ?? []).filter((l) => l?.text)
    const hasCard = lines.length > 0
    const ink = themed ? surfaceInk[surface] : undefined
    const patternCss = backgroundImage ? undefined : patternStyle(pattern)
    return (
      <section
        className={cn(
          'relative flex items-center px-6 py-16',
          minHeightClasses[minHeight] || 'min-h-[500px]',
          backgroundImage ? 'bg-cover bg-center' : themed ? surfaceClasses[surface] : 'bg-[var(--block-accent)]',
          // #569: only the accent-painted branch has a --block-accent-foreground to read.
          backgroundImage
            ? 'text-primary-foreground'
            : themed
              ? ''
              : 'text-[var(--block-accent-foreground)]',
          patternCss && 'overflow-hidden'
        )}
        style={
          backgroundImage
            ? { backgroundImage: `url(${backgroundImage})` }
            : themed
              ? ({
                  ...accentVars(backgroundColor),
                  // --block-accent stays the brand (accentVars); ink reads from the surface token.
                  '--block-accent-foreground': ink,
                } as CSSProperties)
              : accentVars(backgroundColor)
        }
      >
        {patternCss && (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={patternCss} />
        )}
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
            hasCard && 'grid items-center gap-12 lg:grid-cols-2'
          )}
        >
        <div className={alignmentTextClasses[alignment]}>
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
              <ButtonLink href={primaryCtaHref} size="lg"
                  variant={themed ? 'default' : 'secondary'}
                  className="h-12 px-8 text-base font-semibold"
                >
                  {primaryCtaLabel}
                </ButtonLink>
            )}
            {/*
              #569: this button's own background is a 10% wash, so it reads as
              whatever is behind it — the accent. Its ink follows the derived
              foreground, falling back to white so the background-image branch
              (which sets no accent var) is unchanged.
            */}
            {secondaryCtaLabel && (
              <ButtonLink href={secondaryCtaHref} size="lg"
                  variant="outline"
                  className="h-12 px-8 text-base font-semibold border-[var(--block-accent-foreground,#fff)]/30 bg-[var(--block-accent-foreground,#fff)]/10 text-[var(--block-accent-foreground,#fff)] hover:bg-[var(--block-accent-foreground,#fff)]/20 hover:text-[var(--block-accent-foreground,#fff)]"
                >
                  {secondaryCtaLabel}
                </ButtonLink>
            )}
          </div>
        </div>
        {hasCard && (
          <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-muted-foreground/40" />
              <span aria-hidden="true" className="size-2.5 rounded-full bg-muted-foreground/40" />
              <span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--block-accent)]" />
              {cardTitle && <span className="ml-2 font-mono text-xs text-muted-foreground">{cardTitle}</span>}
            </div>
            <div className="space-y-3 p-5 font-mono text-sm leading-relaxed">
              {lines.map((l, i) => (
                <p key={i} className={cn('whitespace-pre-wrap break-words', cardLineClasses[l.kind] ?? cardLineClasses.prompt)}>
                  {l.text}
                </p>
              ))}
            </div>
          </div>
        )}
        </div>
      </section>
    )
  },
}
