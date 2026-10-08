import type { ComponentConfig } from '@measured/puck'
import { useLocale, useTranslations } from 'next-intl'
import { IconCheck, IconShieldCheck } from '@tabler/icons-react'
import { ButtonLink } from '../../../utils/button-link'
import { courseCheckoutHref, isFreePrice } from '../../../utils/checkout-href'
import { formatMoney } from '../../../utils/format-money'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../../utils/section-spacing'
import { CoursePickerSingleField } from '../course-picker-single-field'
import { ProductPickerSingleField } from '../product-picker-field'
import { includedCourses, resolveCourseBinding, resolveProductBinding } from './binding'
import { BindingNotice } from './course-ui'
import { useCourseNotice, useProductNotice } from './use-course-notice'

type FeatureItem = { text: string }

export type CoursePricingCardProps = {
  courseId: string
  productId: string
  title: string
  subtitle: string
  features: FeatureItem[]
  guarantee: string
  ctaLabel: string
} & SectionSpacingProps

/**
 * One price card bound to a course OR a product (the product wins when both
 * are set). Price, currency and the included courses come from the binding;
 * `features` and `guarantee` are the only written copy. A course → checkout;
 * a one-course product → that course's checkout; a bundle → /products/{id}.
 */
export const CoursePricingCard: ComponentConfig<CoursePricingCardProps> = {
  label: 'Course Pricing Card',
  fields: {
    courseId: {
      type: 'custom',
      label: 'Course',
      render: ({ value, onChange }) => <CoursePickerSingleField value={value as string | undefined} onChange={onChange} />,
    },
    productId: {
      type: 'custom',
      label: 'Product',
      render: ({ value, onChange }) => <ProductPickerSingleField value={value as string | undefined} onChange={onChange} />,
    },
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    features: {
      type: 'array',
      label: 'Features',
      arrayFields: { text: { type: 'text', label: 'Feature' } },
      defaultItemProps: { text: 'What the price includes' },
      getItemSummary: (item: FeatureItem) => item.text || 'Feature',
    },
    guarantee: { type: 'text', label: 'Guarantee' },
    ctaLabel: { type: 'text', label: 'Button Label' },
    ...sectionSpacingFields,
  },
  defaultProps: {
    courseId: '',
    productId: '',
    title: '',
    subtitle: '',
    // Prompts for the editor, not claims (access terms differ per school).
    features: [
      { text: 'Replace with what the price includes' },
      { text: 'One short line per benefit' },
    ],
    guarantee: '',
    ctaLabel: '',
    ...sectionSpacingDefaults,
  },
  render: function CoursePricingCardView(props) {
    const { courseId, productId, title, subtitle, features, guarantee, ctaLabel, puck } = props
    const t = useTranslations('puck.courseBlocks')
    const locale = useLocale()
    const product = resolveProductBinding(puck?.metadata, productId)
    const course = resolveCourseBinding(puck?.metadata, courseId)
    const productNotice = useProductNotice(product)
    const courseNotice = useCourseNotice(course)

    // The product wins when one is set; otherwise the course.
    const useProduct = product.state !== 'unbound'
    let card: { name: string; price: number | null; currency: string | null; href: string; includes: string[] } | null = null
    if (useProduct && product.product) {
      const p = product.product
      card = {
        name: p.name,
        price: p.price,
        currency: p.currency,
        href: p.href,
        includes: p.courseIds.length > 1 ? includedCourses(puck?.metadata, p.courseIds).map((c) => c.title) : [],
      }
    } else if (!useProduct && course.state === 'ready' && course.course) {
      const c = course.course
      card = { name: c.title, price: c.price, currency: c.currency, href: courseCheckoutHref(c), includes: [] }
    }

    if (!card) {
      if (!puck?.isEditing) return <></>
      const message = useProduct ? productNotice : course.state === 'unbound' ? t('notice.unboundPricing') : courseNotice
      return <BindingNotice title={t('blocks.CoursePricingCard')} message={message} />
    }

    const free = isFreePrice(card.price)
    const price = formatMoney(card.price, card.currency, locale)
    const label = ctaLabel.trim() || (free ? t('enrollFree') : t('buyNow'))
    const featureList = (features ?? []).map((f) => f?.text?.trim()).filter((s): s is string => !!s)

    return (
      <div {...sectionOuterProps(props)}>
        <div {...sectionInnerProps(props)}>
          {(title || subtitle) && (
            <div className="mb-10 text-center">
              {title && <h2 className="text-balance text-3xl font-semibold text-foreground">{title}</h2>}
              {subtitle && <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{subtitle}</p>}
            </div>
          )}
          <div className="mx-auto w-full max-w-md rounded-card border border-border bg-card p-8 text-left">
            <h3 className="text-lg font-semibold text-foreground">{card.name}</h3>
            <p className="mt-4 text-4xl font-semibold tracking-tight text-foreground">{free ? t('free') : price}</p>
            {card.includes.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-foreground">{t('includesCount', { count: card.includes.length })}</p>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {card.includes.map((name, i) => (
                    <li key={i} className="truncate">{name}</li>
                  ))}
                </ul>
              </div>
            )}
            {featureList.length > 0 && (
              <ul className="mt-6 space-y-2.5 border-t border-border pt-6">
                {featureList.map((text, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                    <IconCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--brand-text,var(--primary))]" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            )}
            <ButtonLink href={card.href} size="lg" className="mt-8 w-full">
              {label}
            </ButtonLink>
            {guarantee.trim() && (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <IconShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
                {guarantee}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  },
}
