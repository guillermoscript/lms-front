'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { IconCheck, IconChevronRight } from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface StudentLesson {
  id: number
  title: string
  description: string | null
  sequence: number
  completed: boolean
}

type Status = 'all' | 'pending' | 'completed'
type Sort = 'order' | 'title'

/** Search / filter / sort for a student's lesson list — same controls as the teacher's course content list. */
export function LessonExplorer({
  lessons,
  courseId,
}: {
  lessons: StudentLesson[]
  courseId: string
}) {
  const t = useTranslations('courseDetails')
  const locale = useLocale()
  const id = useId()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [sort, setSort] = useState<Sort>('order')

  const statuses = (['all', 'pending', 'completed'] as const).map((value) => ({
    value,
    label: t(`list.${value}`),
  }))
  const sorts = (['order', 'title'] as const).map((value) => ({
    value,
    label: t(`list.${value}`),
  }))

  const query = search.trim().toLocaleLowerCase(locale)
  const visible = lessons
    .filter(
      (l) =>
        (!query || l.title.toLocaleLowerCase(locale).includes(query)) &&
        (status === 'all' || (status === 'completed') === l.completed)
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, locale) || a.id - b.id
        : a.sequence - b.sequence || a.id - b.id
    )
  const filtered = search !== '' || status !== 'all'

  function reset() {
    setSearch('')
    setStatus('all')
  }

  return (
    <div className="flex flex-col gap-4">
      {lessons.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
              <Label htmlFor={`${id}-search`}>{t('list.search')}</Label>
              <Input
                id={`${id}-search`}
                type="search"
                placeholder={t('list.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-1 basis-36 flex-col gap-1.5 sm:flex-none">
              <Label htmlFor={`${id}-status`}>{t('list.status')}</Label>
              <Select
                items={statuses}
                value={status}
                onValueChange={(v) => setStatus((v as Status) ?? 'all')}
              >
                <SelectTrigger id={`${id}-status`} className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statuses.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 basis-36 flex-col gap-1.5 sm:flex-none">
              <Label htmlFor={`${id}-sort`}>{t('list.sort')}</Label>
              <Select
                items={sorts}
                value={sort}
                onValueChange={(v) => {
                  if (v === 'order' || v === 'title') setSort(v)
                }}
              >
                <SelectTrigger id={`${id}-sort`} className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sorts.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={reset}>
                {t('list.reset')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t('list.results', { count: visible.length, total: lessons.length })}
          </p>
        </>
      )}

      {lessons.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('noLessons')}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{t('list.noMatches')}</p>
          <p className="text-sm text-muted-foreground">{t('list.noMatchesHint')}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t('list.reset')}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2">
          {visible.map((lesson) => (
            <li key={lesson.id}>
              <Link
                href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:p-4"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums',
                    lesson.completed
                      ? 'border-success/20 bg-success/15 text-success'
                      : 'bg-background text-muted-foreground group-hover:text-brand-text'
                  )}
                >
                  {lesson.completed ? <IconCheck className="size-4" aria-hidden="true" /> : lesson.sequence}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-brand-text">
                    {lesson.title}
                  </span>
                  {lesson.description && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {lesson.description}
                    </span>
                  )}
                </span>
                {lesson.completed && (
                  <>
                    <span className="sr-only">{t('completedLabel')}</span>
                    <span aria-hidden="true" className="hidden text-xs font-medium text-success sm:inline">
                      {t('completedLabel')}
                    </span>
                  </>
                )}
                <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
