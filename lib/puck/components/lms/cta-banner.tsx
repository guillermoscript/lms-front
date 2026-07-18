import type { ComponentConfig } from '@measured/puck'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'

export type CtaBannerProps = {
  heading: string
  subtitle: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel: string
  secondaryHref: string
} & SectionSpacingProps

/**
 * Puck wrapper for the Tailark `call-to-action-1` block (installed to
 * components/call-to-action.tsx via `npx shadcn add @tailark/call-to-action-1`).
 *
 * Pattern B with a friction fix: the Tailark source uses `<Button asChild><Link/></Button>`,
 * but this project's Button (`@base-ui/react`) has no `asChild` prop (see CLAUDE.md). So the
 * wrapper composes it the supported way — `<Link><Button/></Link>`. Buttons render only when
 * both their label and href are set.
 */
export const CtaBanner: ComponentConfig<CtaBannerProps> = {
  label: 'CTA Banner',
  fields: {
    heading: { type: 'text', label: 'Heading' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    primaryLabel: { type: 'text', label: 'Primary Button Label' },
    primaryHref: { type: 'text', label: 'Primary Button URL' },
    secondaryLabel: { type: 'text', label: 'Secondary Button Label' },
    secondaryHref: { type: 'text', label: 'Secondary Button URL' },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    heading: 'Start building your course today',
    subtitle: 'Join thousands of educators publishing on the platform.',
    primaryLabel: 'Get Started',
    primaryHref: '/auth/sign-up',
    secondaryLabel: 'Book a Demo',
    secondaryHref: '/contact',
  },
  render: ({
    paddingY,
    paddingX,
    maxWidth,
    marginY,
    heading,
    subtitle,
    primaryLabel,
    primaryHref,
    secondaryLabel,
    secondaryHref,
  }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="text-center">
            {heading && (
              <h2 className="text-balance text-4xl font-semibold lg:text-5xl">{heading}</h2>
            )}
            {subtitle && <p className="mt-4 text-muted-foreground">{subtitle}</p>}
            <div className="mt-12 flex flex-wrap justify-center gap-4">
              {primaryLabel && primaryHref && (
                <Link href={primaryHref}>
                  <Button size="lg">{primaryLabel}</Button>
                </Link>
              )}
              {secondaryLabel && secondaryHref && (
                <Link href={secondaryHref}>
                  <Button size="lg" variant="outline">
                    {secondaryLabel}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
