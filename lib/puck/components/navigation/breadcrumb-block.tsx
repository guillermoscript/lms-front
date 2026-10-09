import { safeHref } from '../../utils/safe-href'
import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

type BreadcrumbItem = {
  label: string
  href: string
}

export type BreadcrumbBlockProps = {
  items: BreadcrumbItem[]
  separator: string
}

export const BreadcrumbBlock: ComponentConfig<BreadcrumbBlockProps> = {
  label: 'Breadcrumb',
  fields: {
    items: {
      type: 'array',
      label: 'Items',
      arrayFields: {
        label: { type: 'text', label: 'Label' },
        href: { type: 'text', label: 'URL' },
      },
      defaultItemProps: { label: 'Page', href: '#' },
    },
    separator: {
      type: 'select',
      label: 'Separator',
      options: [
        { label: '/', value: '/' },
        { label: '>', value: '\u203a' },
        { label: '\u2192', value: '\u2192' },
        { label: '\u00b7', value: '\u00b7' },
      ],
    },
  },
  defaultProps: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Courses', href: '/courses' },
      { label: 'Current Page', href: '' },
    ],
    separator: '/',
  },
  render: function BreadcrumbView({ items, separator }) {
    const t = useTranslations('puck.render')
    if (!items || items.length === 0) return <></>

    return (
      <nav aria-label={t('breadcrumb')} className="text-sm">
        <ol className="flex items-center gap-2 list-none p-0 m-0">
          {items.map((item, i) => {
            const isLast = i === items.length - 1
            return (
              <li key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden="true" className="text-muted-foreground/40">{separator}</span>
                )}
                {isLast || !item.href ? (
                  <span className="text-foreground font-medium truncate" aria-current={isLast ? 'page' : undefined}>{item.label}</span>
                ) : (
                  <a
                    href={safeHref(item.href)}
                    className="text-muted-foreground hover:text-foreground no-underline transition-colors truncate"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    )
  },
}
