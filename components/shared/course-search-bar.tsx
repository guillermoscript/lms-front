'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition, useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { IconSearch, IconX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface CourseSearchBarProps {
  categories: { id: number; name: string }[]
  currentSearch?: string
  currentCategory?: string
}

export function CourseSearchBar({
  categories,
  currentSearch = '',
  currentCategory = '',
}: CourseSearchBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentSearch)
  const t = useTranslations('courseSearch')

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`)
      })
    },
    [router, pathname, searchParams]
  )

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== currentSearch) {
        updateParams({ search: searchValue })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchValue, currentSearch, updateParams])

  const handleCategoryClick = (categoryId: string) => {
    updateParams({ category: categoryId === currentCategory ? '' : categoryId })
  }

  const handleClearSearch = () => {
    setSearchValue('')
    updateParams({ search: '' })
  }

  const handleClearAll = () => {
    setSearchValue('')
    updateParams({ search: '', category: '' })
  }

  const hasActiveFilters = searchValue || currentCategory

  return (
    <div
      className={cn(
        'space-y-4 mb-8',
        isPending && 'opacity-60 pointer-events-none transition-opacity'
      )}
    >
      {/* Search input */}
      <div className="relative max-w-md">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <Input
          type="text"
          placeholder={t('placeholder')}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-9 pr-9 h-10 bg-muted/40 border-transparent focus:border-primary/30 focus:bg-background rounded-xl text-sm"
          aria-label={t('placeholder')}
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('clearFilters')}
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="list"
          aria-label="Course categories"
        >
          <button
            type="button"
            onClick={() => handleCategoryClick('')}
            className={cn(
              'px-4 py-1.5 text-sm rounded-full border transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              !currentCategory
                ? 'bg-foreground text-background border-foreground font-semibold'
                : 'border-border bg-muted/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            )}
          >
            {t('allCategories')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(String(cat.id))}
              className={cn(
                'px-4 py-1.5 text-sm rounded-full border transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                currentCategory === String(cat.id)
                  ? 'bg-foreground text-background border-foreground font-semibold'
                  : 'border-border bg-muted/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Clear all filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClearAll}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          {t('clearFilters')}
        </button>
      )}
    </div>
  )
}
