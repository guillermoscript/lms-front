import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type PricingItem = {
  name: string
  price: string
  period: string
  description: string
  features: string
  highlighted: boolean
  ctaLabel: string
  ctaHref: string
}

export type PricingTableProps = {
  title: string
  subtitle: string
  items: PricingItem[]
} & SectionSpacingProps

export const PricingTable: ComponentConfig<PricingTableProps> = {
  label: 'Pricing Table',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    items: {
      type: 'array',
      label: 'Plans',
      arrayFields: {
        name: { type: 'text', label: 'Plan Name' },
        price: { type: 'text', label: 'Price' },
        period: { type: 'text', label: 'Period (e.g. /month)' },
        description: { type: 'text', label: 'Description' },
        features: { type: 'textarea', label: 'Features (one per line)' },
        highlighted: {
          type: 'radio',
          label: 'Highlighted',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
        ctaLabel: { type: 'text', label: 'Button Label' },
        ctaHref: { type: 'text', label: 'Button URL' },
      },
      defaultItemProps: {
        name: 'Plan',
        price: '$29',
        period: '/month',
        description: 'Perfect for getting started',
        features: 'Feature 1\nFeature 2\nFeature 3',
        highlighted: false,
        ctaLabel: 'Get Started',
        ctaHref: '#',
      },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'Simple Pricing',
    subtitle: 'Choose the plan that fits your needs.',
    items: [
      { name: 'Basic', price: '$19', period: '/month', description: 'For individuals', features: 'Access to all courses\nCommunity support\nCertificates', highlighted: false, ctaLabel: 'Start Free', ctaHref: '#' },
      { name: 'Pro', price: '$49', period: '/month', description: 'For professionals', features: 'Everything in Basic\nPriority support\n1-on-1 mentoring\nAdvanced courses', highlighted: true, ctaLabel: 'Get Pro', ctaHref: '#' },
      { name: 'Team', price: '$99', period: '/month', description: 'For organizations', features: 'Everything in Pro\nTeam management\nCustom integrations\nDedicated support', highlighted: false, ctaLabel: 'Contact Us', ctaHref: '#' },
    ],
    ...sectionSpacingDefaults,
  },
  render: ({ title, subtitle, items, paddingY, paddingX, maxWidth, marginY }) => {
    const t = useTranslations('puck.render')
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!items.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="text-center">
            {title && (
              <h2 className="text-3xl font-bold text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground mb-10 text-lg">{subtitle}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {items.map((plan, i) => (
                <div
                  key={i}
                  className={cn(
                    'relative p-8 rounded-xl transition-all duration-300 hover:-translate-y-1',
                    plan.highlighted
                      ? 'border-2 border-primary bg-primary text-primary-foreground shadow-lg hover:shadow-xl'
                      : 'border border-border bg-card text-foreground hover:shadow-md'
                  )}
                >
                  {plan.highlighted && (
                    <Badge
                      variant="secondary"
                      className="absolute -top-3 left-1/2 -translate-x-1/2"
                    >
                      {t('mostPopular')}
                    </Badge>
                  )}
                  <h3 className="font-semibold text-lg mb-1 truncate">{plan.name}</h3>
                  <p className={cn(
                    'text-sm mb-4',
                    plan.highlighted ? 'opacity-80' : 'text-muted-foreground'
                  )}>
                    {plan.description}
                  </p>
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold">{plan.price}</span>
                    <span className={cn(
                      'text-sm',
                      plan.highlighted ? 'opacity-80' : 'text-muted-foreground'
                    )}>
                      {plan.period}
                    </span>
                  </div>
                  <ul className="list-none p-0 mb-6 text-left space-y-1.5">
                    {plan.features.split('\n').filter(Boolean).map((f, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm py-1">
                        <span aria-hidden="true" className={cn(
                          'font-bold',
                          plan.highlighted ? 'text-primary-foreground' : 'text-primary'
                        )}>
                          ✓
                        </span>
                        <span className="sr-only">{t('included')}</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href={plan.ctaHref} className="block">
                    <Button
                      size="lg"
                      variant={plan.highlighted ? 'secondary' : 'default'}
                      className="w-full h-10 text-sm font-semibold rounded-lg"
                    >
                      {plan.ctaLabel}
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
