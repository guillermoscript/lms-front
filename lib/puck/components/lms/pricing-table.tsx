import { ButtonLink } from '../../utils/button-link'
import type { ComponentConfig } from '@measured/puck'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { LandingPlan, PuckMetadata } from '../../types'
import { normalizeIntegerIdList } from '../../utils/collect-bound-ids'
import { formatMoney } from '../../utils/format-money'
import { PlanPickerField } from './product-picker-field'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterProps, sectionInnerProps } from '../../utils/section-spacing'

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
  // Pinned plans, in order ({ id }[], like CourseGrid.courseIds). Empty = every plan.
  planIds?: { id: string }[]
  showDescription?: boolean
  items: PricingItem[]
} & SectionSpacingProps

const KNOWN_INTERVALS = new Set(['day', 'week', 'month', 'quarter', 'year'])

/** The live plans to show: pinned ids in order when any resolve, else all of them. */
export function selectLivePlans(plans: LandingPlan[], planIds: unknown): LandingPlan[] {
  const byId = new Map(plans.map((p) => [p.id, p]))
  const pinned = normalizeIntegerIdList(planIds)
    .map((id) => byId.get(id))
    .filter((p): p is LandingPlan => !!p)
  if (!pinned.length) return plans
  // Re-pick the highlight inside the subset (middle of three or more).
  return pinned.map((p, i) => ({ ...p, highlighted: pinned.length >= 3 && i === 1 }))
}

export const PricingTable: ComponentConfig<PricingTableProps> = {
  label: 'Pricing Table',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    planIds: {
      type: 'custom',
      label: 'Pinned Plans',
      render: ({ value, onChange }) => (
        <PlanPickerField value={value as { id: string }[] | undefined} onChange={onChange} />
      ),
    },
    showDescription: {
      type: 'radio',
      label: 'Show Description',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    items: {
      type: 'array',
      label: 'Plans',
      arrayFields: {
        name: { type: 'text', label: 'Plan Name' },
        price: { type: 'text', label: 'Price' },
        period: { type: 'text', label: 'Period (eg /month)' },
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
    planIds: [],
    showDescription: true,
    items: [
      { name: 'Basic', price: '$19', period: '/month', description: 'For individuals', features: 'Access to all courses\nCommunity support\nCertificates', highlighted: false, ctaLabel: 'Start Free', ctaHref: '#' },
      { name: 'Pro', price: '$49', period: '/month', description: 'For professionals', features: 'Everything in Basic\nPriority support\n1-on-1 mentoring\nAdvanced courses', highlighted: true, ctaLabel: 'Get Pro', ctaHref: '#' },
      { name: 'Team', price: '$99', period: '/month', description: 'For organizations', features: 'Everything in Pro\nTeam management\nCustom integrations\nDedicated support', highlighted: false, ctaLabel: 'Contact Us', ctaHref: '#' },
    ],
    ...sectionSpacingDefaults,
  },
  render: function PricingTableView({ title, subtitle, planIds, showDescription = true, items, paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, puck }) {
    const t = useTranslations('puck.render')
    const tc = useTranslations('puck.courseBlocks')
    const locale = useLocale()
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }

    // Real subscription plans resolved server-side and handed in via metadata. When present
    // (published pages, preview, editor with data) we render the tenant's actual plans;
    // otherwise fall back to the manually-entered items so the canvas is never empty.
    const livePlans = selectLivePlans(((puck?.metadata as PuckMetadata | undefined)?.plans ?? []) as LandingPlan[], planIds)

    // Money in the page locale; a known cadence is translated, a raw "45 days" is kept.
    const period = (interval: string | null) =>
      interval ? `/${KNOWN_INTERVALS.has(interval) ? tc(`interval.${interval}`) : interval}` : ''

    const resolvedItems: PricingItem[] = livePlans.length > 0
      ? livePlans.map((p) => ({
          name: p.name,
          price: formatMoney(p.price, p.currency, locale) ?? t('free'),
          period: period(p.interval),
          description: showDescription ? (p.description ?? '') : '',
          features: (p.features ?? []).join('\n'),
          highlighted: p.highlighted,
          ctaLabel: t('getStarted'),
          ctaHref: p.href || '#',
        }))
      : (items ?? []).map((item) => (showDescription ? item : { ...item, description: '' }))

    if (!resolvedItems.length) return <></>

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing)}>
          <div className="text-center">
            {title && (
              <h2 className="text-3xl font-bold text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground mb-10 text-lg">{subtitle}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {resolvedItems.map((plan, i) => (
                <div
                  key={i}
                  className={cn(
                    'relative p-8 rounded-card transition-colors motion-reduce:transition-none duration-300 ',
                    plan.highlighted
                      ? 'border-2 border-primary bg-primary text-primary-foreground  '
                      : 'border border-border bg-card text-foreground '
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
                  <ButtonLink href={plan.ctaHref} size="lg"
                      variant={plan.highlighted ? 'secondary' : 'default'}
                      className="w-full h-10 text-sm font-semibold"
                    >
                      {plan.ctaLabel}
                    </ButtonLink>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
