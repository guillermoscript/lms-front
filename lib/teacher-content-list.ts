export interface ContentListItem {
  id: number
  title: string
  status: string | null
  createdAt?: string | null
  sequence?: number | null
}

export type ContentSort = 'order' | 'newest' | 'title'

export function filterContent<T extends ContentListItem>(
  items: T[],
  search: string,
  status: string,
  sort: ContentSort,
  locale: string
): T[] {
  const query = search.trim().toLocaleLowerCase(locale)
  return items
    .filter(
      (item) =>
        (!query || item.title.toLocaleLowerCase(locale).includes(query)) &&
        (status === 'all' || (item.status ?? 'draft') === status)
    )
    .sort((a, b) => {
      if (sort === 'title')
        return a.title.localeCompare(b.title, locale) || a.id - b.id
      if (sort === 'newest')
        return (
          (Date.parse(b.createdAt ?? '') || 0) -
            (Date.parse(a.createdAt ?? '') || 0) || b.id - a.id
        )
      return (
        (a.sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.id - b.id
      )
    })
}
