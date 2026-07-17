import type { ComponentConfig } from '@measured/puck'
import type { LandingCourse, PuckMetadata } from '../../types'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'
import { CatalogBrowserView, type CatalogCard } from './catalog-browser-view'

export type CatalogBrowserProps = {
  title: string
  subtitle: string
  columns: '2' | '3' | '4'
  pageSize: number
  showSearch: boolean
  showPriceFilter: boolean
} & SectionSpacingProps

/**
 * A filterable, paginated browser over the tenant's real courses (metadata.courses):
 * search-by-title, an All/Free/Paid price filter, and "load more" pagination. Falls back to
 * placeholder cards so the editor canvas / a brand-new tenant is never empty. Cards link to
 * `/courses/{id}`. The stateful UI lives in the 'use client' CatalogBrowserView.
 */
export const CatalogBrowser: ComponentConfig<CatalogBrowserProps> = {
  label: 'Catalog Browser',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    columns: {
      type: 'select',
      label: 'Columns',
      options: [
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
      ],
    },
    pageSize: { type: 'number', label: 'Courses Per Page', min: 1, max: 48 },
    showSearch: {
      type: 'radio',
      label: 'Show Search',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    showPriceFilter: {
      type: 'radio',
      label: 'Show Price Filter',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'Browse our catalog',
    subtitle: 'Find the right course and start learning today.',
    columns: '3',
    pageSize: 9,
    showSearch: true,
    showPriceFilter: true,
  },
  render: ({ title, subtitle, columns, pageSize, showSearch, showPriceFilter, paddingY, paddingX, maxWidth, marginY, puck }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }

    // Real catalog resolved server-side and handed in via metadata. When present we render the
    // tenant's actual published courses; otherwise fall back to placeholders so the canvas is
    // never empty (e.g. a brand-new school with no courses yet).
    const live = ((puck?.metadata as PuckMetadata | undefined)?.courses ?? []) as LandingCourse[]

    const cards: CatalogCard[] = live.length > 0
      ? live.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description ?? '',
          price: c.price,
          currency: c.currency,
          image: c.image || `https://placehold.co/400x225/e2e8f0/64748b?text=${encodeURIComponent(c.title)}`,
          href: `/courses/${c.id}`,
        }))
      : Array.from({ length: 9 }, (_, i) => ({
          id: `placeholder-${i}`,
          title: `Course ${i + 1}`,
          description: 'An engaging course designed to help you master new skills.',
          price: i % 3 === 0 ? null : (i + 1) * 19,
          currency: 'USD' as string | null,
          image: `https://placehold.co/400x225/e2e8f0/64748b?text=Course+${i + 1}`,
          href: undefined as string | undefined,
        }))

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          {title && (
            <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
          )}
          {subtitle && (
            <p className="text-center text-muted-foreground max-w-[640px] mx-auto mb-10 leading-relaxed">
              {subtitle}
            </p>
          )}
          <CatalogBrowserView
            cards={cards}
            columns={columns}
            pageSize={pageSize}
            showSearch={showSearch}
            showPriceFilter={showPriceFilter}
          />
        </div>
      </div>
    )
  },
}
