'use client'

/**
 * Client-interactive view for the CatalogBrowser block: search-by-title, price filter
 * (All / Free / Paid), and "load more" pagination over a resolved course list. Kept in its
 * own 'use client' module so the Puck render (which may run on the server render path) can
 * delegate the stateful UI here.
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export type CatalogCard = {
  id: string
  title: string
  description: string
  price: number | null
  currency: string | null
  image: string
  href?: string
}

const columnClasses: Record<string, string> = {
  '2': 'grid-cols-1 md:grid-cols-2',
  '3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
}

interface Props {
  cards: CatalogCard[]
  columns: '2' | '3' | '4'
  pageSize: number
  showSearch: boolean
  showPriceFilter: boolean
}

export function CatalogBrowserView({ cards, columns, pageSize, showSearch, showPriceFilter }: Props) {
  const t = useTranslations('puck.render')
  const [query, setQuery] = useState('')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [visible, setVisible] = useState(Math.max(1, pageSize))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cards.filter((c) => {
      if (q && !c.title.toLowerCase().includes(q)) return false
      const isFree = c.price == null || c.price === 0
      if (priceFilter === 'free' && !isFree) return false
      if (priceFilter === 'paid' && isFree) return false
      return true
    })
  }, [cards, query, priceFilter])

  const shown = filtered.slice(0, visible)

  const formatPrice = (price: number, currency: string | null) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(price)
    } catch {
      return `$${price}`
    }
  }

  const filters: { key: 'all' | 'free' | 'paid'; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'free', label: t('filterFree') },
    { key: 'paid', label: t('filterPaid') },
  ]

  return (
    <div>
      {(showSearch || showPriceFilter) && (
        <div className="flex flex-col sm:flex-row gap-3 mb-8 sm:items-center sm:justify-between">
          {showSearch && (
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setVisible(Math.max(1, pageSize))
              }}
              placeholder={t('searchCourses')}
              className="w-full sm:max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )}
          {showPriceFilter && (
            <div className="flex gap-1 rounded-lg border border-border p-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setPriceFilter(f.key)
                    setVisible(Math.max(1, pageSize))
                  }}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    priceFilter === f.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {shown.length > 0 ? (
        <div className={cn('grid gap-6', columnClasses[columns])}>
          {shown.map((course) => {
            const Card = course.href ? 'a' : 'div'
            return (
              <Card
                key={course.id}
                {...(course.href ? { href: course.href } : {})}
                className="group block rounded-xl overflow-hidden border border-border bg-card transition-all duration-300 hover:shadow-md hover:-translate-y-1"
              >
                <div className="aspect-video overflow-hidden">
                  <img
                    src={course.image}
                    alt={course.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-base text-foreground mb-2 truncate">{course.title}</h3>
                  {course.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                      {course.description}
                    </p>
                  )}
                  <p className="font-bold text-lg text-primary">
                    {course.price == null || course.price === 0 ? t('free') : formatPrice(course.price, course.currency)}
                  </p>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-12">{t('noCoursesFound')}</p>
      )}

      {visible < filtered.length && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + Math.max(1, pageSize))}
            className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t('loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
