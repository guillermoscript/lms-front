'use client'

/**
 * Custom Puck field: pick specific courses for CourseGrid curation.
 *
 * Renders the tenant's real published courses (from LandingCoursesProvider) as a
 * searchable list you add from, plus an ordered list of the picked courses you can
 * reorder / remove. The field value stays `{ id: string }[]` so CourseGrid's render
 * (which resolves ids against the live catalog) is unchanged — only the editing UX
 * moves from "type raw IDs" to "click real course titles".
 */
import { useMemo, useState } from 'react'
import { IconArrowUp, IconArrowDown, IconX, IconSearch, IconPlus } from '@tabler/icons-react'
import { useLandingCourses } from '../../utils/courses-context'

type CourseIdItem = { id: string }

interface Props {
  value: CourseIdItem[] | undefined
  onChange: (value: CourseIdItem[]) => void
}

export function CoursePickerField({ value, onChange }: Props) {
  const courses = useLandingCourses()
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => (value ?? []).map((v) => v?.id).filter((id): id is string => !!id),
    [value]
  )
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses.filter(
      (c) => !selectedSet.has(c.id) && (!q || c.title.toLowerCase().includes(q))
    )
  }, [courses, selectedSet, query])

  const set = (ids: string[]) => onChange(ids.map((id) => ({ id })))
  const add = (id: string) => set([...selected, id])
  const remove = (id: string) => set(selected.filter((x) => x !== id))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= selected.length) return
    const next = [...selected]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }

  if (courses.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground py-2">
        No published courses yet. Publish a course to curate it here — meanwhile the grid shows the latest courses automatically.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Selected, in display order */}
      {selected.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {selected.map((id, i) => {
            const course = byId.get(id)
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
              >
                <span className="text-xs tabular-nums text-muted-foreground w-4 text-center">{i + 1}</span>
                <span className="flex-1 truncate text-[13px] text-foreground">
                  {course ? course.title : <span className="text-muted-foreground italic">Unknown course ({id})</span>}
                </span>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <IconArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === selected.length - 1}
                  onClick={() => move(i, 1)}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <IconArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => remove(id)}
                  className="p-1 text-muted-foreground hover:text-destructive"
                >
                  <IconX className="w-3.5 h-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No courses pinned — the grid shows your latest published courses. Add some below to feature them in order.
        </p>
      )}

      {/* Search + add from the catalog */}
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses to add…"
          className="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {available.length > 0 ? (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {available.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => add(c.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
              >
                <IconPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {query.trim() ? 'No matching courses.' : 'All courses are already pinned.'}
        </p>
      )}
    </div>
  )
}
