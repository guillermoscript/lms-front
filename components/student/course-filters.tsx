'use client'

import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { IconSearch, IconX, IconSortDescending } from '@tabler/icons-react'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'

interface CourseFiltersProps {
  currentStatus: string
  currentSort: string
  currentSearch: string
  counts: { all: number; in_progress: number; completed: number; not_started: number }
}

const statusOptions = [
  { value: 'all', key: 'allCourses' },
  { value: 'in_progress', key: 'inProgress' },
  { value: 'completed', key: 'completed' },
  { value: 'not_started', key: 'notStarted' },
] as const

const sortOptions = [
  { value: 'recent', key: 'mostRecent' },
  { value: 'title', key: 'titleAZ' },
  { value: 'progress', key: 'progress' },
] as const

export function CourseFilters({
  currentStatus,
  currentSort,
  currentSearch,
  counts,
}: CourseFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentSearch)
  const [sortOpen, setSortOpen] = useState(false)
  const t = useTranslations('components.courseFilters')

  const updateFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })

    startTransition(() => {
      router.push(`/dashboard/student/courses?${params.toString()}`)
    })
  }

  const handleStatusChange = (value: string) => {
    updateFilters({ status: value })
  }

  const handleSortChange = (value: string) => {
    updateFilters({ sort: value })
    setSortOpen(false)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search: searchValue })
  }

  const handleClearSearch = () => {
    setSearchValue('')
    updateFilters({ search: '' })
  }

  return (
    <div className={cn("space-y-4", isPending && "opacity-60 pointer-events-none transition-opacity")}>
      {/* Status Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {statusOptions.map((opt) => {
          const count = counts[opt.value as keyof typeof counts] ?? 0
          const isActive = currentStatus === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={cn(
                "flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
              )}
            >
              {t(opt.key)}
              <span className={cn(
                "text-[10px] font-bold tabular-nums min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1.5",
                isActive
                  ? "bg-background/20 text-background"
                  : "bg-foreground/8 text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search & Sort Row */}
      <div className="flex items-center gap-2 sm:gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:max-w-sm">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 pr-9 h-10 bg-muted/40 border-transparent focus:border-primary/30 focus:bg-background rounded-xl text-sm"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-muted/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <IconSortDescending size={16} />
            <span className="hidden sm:inline">{t(sortOptions.find(s => s.value === currentSort)?.key || 'mostRecent')}</span>
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 bg-popover border rounded-xl shadow-xl py-1 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSortChange(opt.value)}
                    className={cn(
                      "w-full text-left px-3.5 py-2.5 sm:py-2 text-sm transition-colors",
                      currentSort === opt.value
                        ? "text-foreground font-semibold bg-muted/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                  >
                    {t(opt.key)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
