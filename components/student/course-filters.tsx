'use client'

import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IconSearch, IconX } from '@tabler/icons-react'
import { useState, useTransition } from 'react'

interface CourseFiltersProps {
  currentStatus: string
  currentSort: string
  currentSearch: string
}

export function CourseFilters({
  currentStatus,
  currentSort,
  currentSearch
}: CourseFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentSearch)
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

  const handleSortChange = (value: string | null) => {
    if (value) {
      updateFilters({ sort: value })
    }
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
    <div className="space-y-4">
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <IconX className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Status Tabs & Sort */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Status Filter Tabs */}
        <Tabs value={currentStatus} onValueChange={handleStatusChange} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">{t('allCourses')}</TabsTrigger>
            <TabsTrigger value="in_progress">{t('inProgress')}</TabsTrigger>
            <TabsTrigger value="completed">{t('completed')}</TabsTrigger>
            <TabsTrigger value="not_started">{t('notStarted')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sort Dropdown */}
        <Select value={currentSort} onValueChange={handleSortChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('sortBy')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{t('mostRecent')}</SelectItem>
            <SelectItem value="title">{t('titleAZ')}</SelectItem>
            <SelectItem value="progress">{t('progress')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
