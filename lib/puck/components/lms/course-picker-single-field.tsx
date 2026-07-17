'use client'

/**
 * Custom Puck field: pick ONE course for EnrollCta.
 *
 * Sibling of course-picker-field.tsx, but single-select: renders the tenant's real published
 * courses (from LandingCoursesProvider) as a searchable radio list and stores a single
 * `courseId: string`. EnrollCta's render resolves the id against the live catalog, so the
 * editing UX is "click a real course title" instead of "type a raw ID".
 */
import { useMemo, useState } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'
import { useLandingCourses } from '../../utils/courses-context'

interface Props {
  value: string | undefined
  onChange: (value: string) => void
}

export function CoursePickerSingleField({ value, onChange }: Props) {
  const courses = useLandingCourses()
  const [query, setQuery] = useState('')

  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const selected = value && byId.has(value) ? byId.get(value) : undefined

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return courses.filter((c) => !q || c.title.toLowerCase().includes(q))
  }, [courses, query])

  if (courses.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground py-2">
        No published courses yet. Publish a course to target it here — meanwhile the CTA links to the full catalog.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {selected ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
          <span className="flex-1 truncate text-[13px] text-foreground">{selected.title}</span>
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange('')}
            className="p-1 text-muted-foreground hover:text-destructive"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No course selected — the CTA links to the full catalog. Pick one below to target it.
        </p>
      )}

      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          className="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {available.length > 0 ? (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {available.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChange(c.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className={
                    'size-3.5 shrink-0 rounded-full border ' +
                    (value === c.id ? 'border-primary bg-primary' : 'border-muted-foreground/40')
                  }
                />
                <span className="truncate">{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">No matching courses.</p>
      )}
    </div>
  )
}
