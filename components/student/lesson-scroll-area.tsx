'use client'

import { useRef, useState } from 'react'
import { useEventListener } from 'usehooks-ts'

export function LessonScrollArea({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  useEventListener(
    'scroll',
    () => {
      const el = scrollRef.current
      if (!el) return
      const max = el.scrollHeight - el.clientHeight
      setProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0)
    },
    // usehooks-ts v3 types predate React 19's nullable RefObject
    scrollRef as React.RefObject<HTMLDivElement>,
    { passive: true }
  )

  return (
    <div className="relative flex-1 min-h-0">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10">
        {/* Reading progress — neutral so it can't be confused with the primary course-progress line above the header */}
        <div
          className="h-0.5 bg-foreground/25 transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-y-contain">
        {children}
      </div>
    </div>
  )
}
