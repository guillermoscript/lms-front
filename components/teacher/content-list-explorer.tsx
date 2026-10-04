'use client'

import { useId, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconLayoutGrid, IconList } from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  BulkContentManager,
  BulkContentRowActions
} from './bulk-content-manager'
import {
  filterContent,
  type ContentListItem,
  type ContentSort
} from '@/lib/teacher-content-list'
import { cn } from '@/lib/utils'

interface ContentRow extends ContentListItem {
  content: ReactNode
}

type Props = {
  items: ContentRow[]
  emptyState: ReactNode
} & (
  | { kind: 'courses' }
  | {
      kind: 'lessons' | 'exercises' | 'exams'
      courseId: number
      tenantId: string
    }
)

/** The same list controls and visible-row selection rules across teacher content. */
export function ContentListExplorer(props: Props) {
  const t = useTranslations('dashboard.teacher.manageCourse.list')
  const locale = useLocale()
  const id = useId()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<ContentSort>(
    props.kind === 'lessons' || props.kind === 'exams' ? 'order' : 'newest'
  )
  const [view, setView] = useState('grid')
  const visible = filterContent(props.items, search, status, sort, locale)
  const statuses = ['all', 'draft', 'published', 'archived'].map((value) => ({
    value,
    label: t(value)
  }))
  const sorts = (
    props.kind === 'lessons' || props.kind === 'exams'
      ? ['order', 'newest', 'title']
      : ['newest', 'title']
  ).map((value) => ({ value, label: t(value) }))
  const filtered = search !== '' || status !== 'all'

  function reset() {
    setSearch('')
    setStatus('all')
  }

  const rows =
    visible.length > 0 ? (
      <div
        data-view={props.kind === 'courses' ? view : 'list'}
        className={cn(
          'grid gap-3',
          props.kind === 'courses' &&
            view === 'grid' &&
            'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
          props.kind === 'courses' &&
            view === 'list' &&
            '[&_[data-slot=card]]:sm:flex-row [&_[data-course-thumbnail]]:sm:w-48 [&_[data-course-thumbnail]]:sm:shrink-0 [&_[data-slot=card-header]]:sm:flex-1 [&_[data-slot=card-content]]:sm:w-64'
        )}
      >
        {visible.map((item) => (
          <div
            key={item.id}
            className={cn(
              'min-w-0',
              props.kind !== 'courses' && 'flex items-center gap-2'
            )}
          >
            <div className="min-w-0 flex-1 h-full">{item.content}</div>
            {props.kind !== 'courses' && (
              <BulkContentRowActions
                id={item.id}
                title={item.title}
                status={item.status}
              />
            )}
          </div>
        ))}
      </div>
    ) : props.items.length === 0 ? (
      props.emptyState
    ) : (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">{t('noMatches')}</p>
        <p className="text-sm text-muted-foreground">{t('noMatchesHint')}</p>
        <Button variant="outline" size="sm" onClick={reset}>
          {t('reset')}
        </Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      {props.items.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
              <Label htmlFor={`${id}-search`}>{t('search')}</Label>
              <Input
                id={`${id}-search`}
                type="search"
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-1 basis-36 flex-col gap-1.5 sm:flex-none">
              <Label htmlFor={`${id}-status`}>{t('status')}</Label>
              <Select
                items={statuses}
                value={status}
                onValueChange={(value) => setStatus(value ?? 'all')}
              >
                <SelectTrigger id={`${id}-status`} className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statuses.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 basis-36 flex-col gap-1.5 sm:flex-none">
              <Label htmlFor={`${id}-sort`}>{t('sort')}</Label>
              <Select
                items={sorts}
                value={sort}
                onValueChange={(value) => {
                  if (
                    value === 'title' ||
                    value === 'newest' ||
                    value === 'order'
                  )
                    setSort(value)
                }}
              >
                <SelectTrigger id={`${id}-sort`} className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sorts.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {props.kind === 'courses' && (
              <ButtonGroup aria-label={t('view')}>
                <Button
                  size="icon"
                  variant={view === 'grid' ? 'secondary' : 'outline'}
                  aria-pressed={view === 'grid'}
                  aria-label={t('grid')}
                  onClick={() => setView('grid')}
                >
                  <IconLayoutGrid />
                </Button>
                <Button
                  size="icon"
                  variant={view === 'list' ? 'secondary' : 'outline'}
                  aria-pressed={view === 'list'}
                  aria-label={t('list')}
                  onClick={() => setView('list')}
                >
                  <IconList />
                </Button>
              </ButtonGroup>
            )}
            {filtered && (
              <Button variant="ghost" size="sm" onClick={reset}>
                {t('reset')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t('results', { count: visible.length, total: props.items.length })}
          </p>
        </>
      )}
      {props.kind === 'courses' ? (
        rows
      ) : (
        <BulkContentManager
          kind={props.kind}
          courseId={props.courseId}
          tenantId={props.tenantId}
          ids={visible.map((item) => item.id)}
          archivedIds={visible
            .filter((item) => item.status === 'archived')
            .map((item) => item.id)}
          selectionKey={`${search}\u0000${status}`}
        >
          {rows}
        </BulkContentManager>
      )}
    </div>
  )
}
