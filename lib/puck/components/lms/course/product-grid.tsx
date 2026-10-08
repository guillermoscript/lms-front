import type { ComponentConfig } from '@measured/puck'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { LandingProduct, PuckMetadata } from '../../../types'
import { normalizeIntegerIdList } from '../../../utils/collect-bound-ids'
import { formatMoney } from '../../../utils/format-money'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../../utils/section-spacing'
import { ProductPickerField } from '../product-picker-field'
import { BindingNotice } from './course-ui'

export type ProductGridProps = {
  title: string
  subtitle: string
  productIds: { id: string }[]
  maxItems: number
  columns: '2' | '3' | '4'
  showDescription: boolean
} & SectionSpacingProps

const columnClasses: Record<string, string> = {
  '2': 'grid-cols-1 md:grid-cols-2',
  '3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
}

/**
 * Cards for the school's real, active products (bundles, memberships, single
 * courses). Pinned `productIds` show in that order; empty shows the newest.
 * Every card links to /products/{id}.
 */
export const ProductGrid: ComponentConfig<ProductGridProps> = {
  label: 'Product Grid',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    productIds: {
      type: 'custom',
      label: 'Products',
      render: ({ value, onChange }) => (
        <ProductPickerField value={value as { id: string }[] | undefined} onChange={onChange} />
      ),
    },
    maxItems: { type: 'number', label: 'Max Items', min: 1, max: 24 },
    columns: {
      type: 'select',
      label: 'Columns',
      options: [
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
      ],
    },
    showDescription: {
      type: 'radio',
      label: 'Show Description',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'Programs',
    subtitle: '',
    productIds: [],
    maxItems: 6,
    columns: '3',
    showDescription: true,
    ...sectionSpacingDefaults,
  },
  render: function ProductGridView(props) {
    const { title, subtitle, productIds, maxItems, columns, showDescription, puck } = props
    const t = useTranslations('puck.courseBlocks')
    const locale = useLocale()
    const live = ((puck?.metadata as PuckMetadata | undefined)?.products ?? []) as LandingProduct[]

    // Curated ids that no longer resolve (inactive/deleted) are skipped; if
    // curation matches nothing, fall back to the newest so the grid is never empty.
    const byId = new Map(live.map((p) => [p.id, p]))
    const curated = normalizeIntegerIdList(productIds)
      .map((id) => byId.get(id))
      .filter((p): p is LandingProduct => !!p)
    const items = (curated.length ? curated : live).slice(0, Math.max(1, Math.floor(maxItems || 6)))

    if (!items.length) {
      return puck?.isEditing ? <BindingNotice title={t('blocks.ProductGrid')} message={t('notice.noProducts')} /> : <></>
    }

    return (
      <div {...sectionOuterProps(props)}>
        <div {...sectionInnerProps(props)}>
          {title && <h2 className="text-balance text-center text-3xl font-semibold text-foreground">{title}</h2>}
          {subtitle && <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">{subtitle}</p>}
          <div className={cn('mt-10 grid gap-6', columnClasses[columns] ?? columnClasses['3'])}>
            {items.map((p) => {
              const price = formatMoney(p.price, p.currency, locale)
              return (
                <a
                  key={p.id}
                  href={`/products/${encodeURIComponent(p.id)}`}
                  className="group flex flex-col overflow-hidden rounded-card border border-border bg-card transition-colors hover:border-foreground/20 motion-reduce:transition-none"
                >
                  {p.image && (
                    <div className="aspect-video overflow-hidden bg-muted">
                      <img src={p.image} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <h3 className="font-semibold text-foreground">{p.name}</h3>
                    {showDescription && p.description && (
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-3 text-sm">
                      <span className="font-semibold text-foreground">{price ?? t('free')}</span>
                      {p.courseIds.length > 1 && (
                        <span className="text-muted-foreground">{t('includesCount', { count: p.courseIds.length })}</span>
                      )}
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    )
  },
}
