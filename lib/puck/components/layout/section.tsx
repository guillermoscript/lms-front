import type { ComponentConfig } from '@measured/puck'
import { DropZone } from '@measured/puck'
import { cn } from '@/lib/utils'
import { readableOn } from '@/lib/color/contrast'

export type SectionProps = {
  backgroundColor: string
  backgroundImage: string
  backgroundGradient: string
  overlayOpacity: number
  paddingY: string
  maxWidth: string
  theme: 'light' | 'dark' | 'transparent'
}

const paddingMap: Record<string, string> = {
  '0': 'py-0',
  '2rem': 'py-8',
  '4rem': 'py-16',
  '6rem': 'py-24',
  '8rem': 'py-32',
}

const maxWidthMap: Record<string, string> = {
  '768px': 'max-w-screen-md',
  '1024px': 'max-w-screen-lg',
  '1280px': 'max-w-screen-xl',
  '100%': 'max-w-full',
}

const themeMap: Record<string, string> = {
  light: 'bg-background text-foreground',
  dark: 'bg-foreground text-background',
  transparent: '',
}

const overlayMap: Record<number, string> = {
  10: 'bg-black/10',
  20: 'bg-black/20',
  30: 'bg-black/30',
  40: 'bg-black/40',
  50: 'bg-black/50',
  60: 'bg-black/60',
  70: 'bg-black/70',
  80: 'bg-black/80',
  90: 'bg-black/90',
  100: 'bg-black',
}

function getOverlayClass(opacity: number): string {
  if (opacity <= 0) return ''
  // Round to nearest 10
  const rounded = Math.round(opacity / 10) * 10
  return overlayMap[rounded] || `bg-black/${opacity}`
}

export const Section: ComponentConfig<SectionProps> = {
  label: 'Section',
  fields: {
    backgroundColor: { type: 'text', label: 'Background Color' },
    backgroundImage: { type: 'text', label: 'Background Image URL' },
    backgroundGradient: { type: 'text', label: 'Background Gradient CSS' },
    overlayOpacity: { type: 'number', label: 'Overlay Opacity (%)', min: 0, max: 100 },
    paddingY: {
      type: 'select',
      label: 'Vertical Padding',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '2rem' },
        { label: 'Medium', value: '4rem' },
        { label: 'Large', value: '6rem' },
        { label: 'XL', value: '8rem' },
      ],
    },
    maxWidth: {
      type: 'select',
      label: 'Content Max Width',
      options: [
        { label: 'Small (768px)', value: '768px' },
        { label: 'Medium (1024px)', value: '1024px' },
        { label: 'Large (1280px)', value: '1280px' },
        { label: 'Full', value: '100%' },
      ],
    },
    theme: {
      type: 'select',
      label: 'Theme',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'Transparent', value: 'transparent' },
      ],
    },
  },
  defaultProps: {
    backgroundColor: '',
    backgroundImage: '',
    backgroundGradient: '',
    overlayOpacity: 0,
    paddingY: '4rem',
    maxWidth: '1280px',
    theme: 'light',
  },
  render: ({ backgroundColor, backgroundImage, backgroundGradient, overlayOpacity, paddingY, maxWidth, theme }) => {
    const hasCustomBg = backgroundColor || backgroundImage || backgroundGradient

    // A custom background suppresses `themeMap[theme]` — the class that carries
    // the text colour — so the content used to fall back to the page's inherited
    // `--foreground`, which is dark in light mode. Any dark custom background
    // therefore rendered dark-on-dark on the live public pages (issue #569).
    // With a flat colour we can derive the ink; behind an image or a gradient we
    // cannot know the luminance, so those keep the existing behaviour (that is
    // what the overlay control is for).
    //
    // Setting `color` alone is not enough: the blocks that land in this zone
    // (Heading, Text) carry an explicit `text-foreground`, which beats an
    // inherited colour. Rebinding the `--foreground` token on the section itself
    // is what actually reaches them — `@theme inline` maps
    // `--color-foreground: var(--foreground)`, and that re-resolves per element,
    // so every descendant using the token follows. `color` stays for anything
    // that simply inherits.
    const derivedInk = backgroundColor ? readableOn(backgroundColor, '') : ''

    return (
      <section
        className={cn(
          'relative bg-cover bg-center',
          !hasCustomBg && themeMap[theme]
        )}
        style={{
          ...(backgroundColor ? { backgroundColor } : {}),
          ...(derivedInk
            ? { color: derivedInk, ['--foreground' as string]: derivedInk }
            : {}),
          ...(backgroundImage
            ? { backgroundImage: `url(${backgroundImage})` }
            : backgroundGradient
              ? { backgroundImage: backgroundGradient }
              : {}),
        }}
      >
        {overlayOpacity > 0 && (
          <div
            aria-hidden="true"
            className={cn(
              'absolute inset-0 pointer-events-none',
              getOverlayClass(overlayOpacity)
            )}
          />
        )}
        <div
          className={cn(
            'relative mx-auto px-6',
            paddingMap[paddingY] || 'py-16',
            maxWidthMap[maxWidth] || 'max-w-screen-xl'
          )}
        >
          <DropZone zone="content" />
        </div>
      </section>
    )
  },
}
