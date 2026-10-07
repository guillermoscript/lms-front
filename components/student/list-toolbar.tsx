'use client'

import { useId } from 'react'
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

export interface ToolbarSelect {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

/** Case/locale-insensitive substring match used by every student list. */
export function matchesQuery(query: string, locale: string, ...fields: (string | null | undefined)[]) {
  const q = query.trim().toLocaleLowerCase(locale)
  return !q || fields.some((f) => (f ?? '').toLocaleLowerCase(locale).includes(q))
}

/**
 * Shared list controls for student pages: search + any number of selects
 * (filters, sort) + clear + "Showing X of Y". Same look as the teacher
 * ContentListExplorer toolbar. Strings are passed in already translated.
 * Caller owns state and filtering; render nothing when the list is empty.
 */
export function ListToolbar({
  search,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  selects,
  resultsText,
  showReset,
  onReset,
  resetLabel,
}: {
  search: string
  onSearchChange: (value: string) => void
  searchLabel: string
  searchPlaceholder: string
  selects: ToolbarSelect[]
  resultsText: string
  showReset: boolean
  onReset: () => void
  resetLabel: string
}) {
  const uid = useId()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
          <Label htmlFor={`${uid}-search`}>{searchLabel}</Label>
          <Input
            id={`${uid}-search`}
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {selects.map((s) => (
          <div key={s.id} className="flex flex-1 basis-36 flex-col gap-1.5 sm:flex-none">
            <Label htmlFor={`${uid}-${s.id}`}>{s.label}</Label>
            <Select items={s.options} value={s.value} onValueChange={(v) => s.onChange(v ?? s.options[0].value)}>
              <SelectTrigger id={`${uid}-${s.id}`} className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {s.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ))}
        {showReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            {resetLabel}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {resultsText}
      </p>
    </div>
  )
}
