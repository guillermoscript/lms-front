'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { IconCheck, IconTarget } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export type WorkspacePanel = 'brief' | 'task' | 'result'

interface ExerciseWorkspaceProps {
  /** Title block. Heads the instructions pane on a desktop, the page on a phone. */
  header: ReactNode
  /** What the student has to do — instructions, criteria, prompt. */
  brief: ReactNode
  /** The doing surface: the coach chat, the artifact, the recorder, the editor. */
  task: ReactNode
  /** Names the task panel for this engine. "AI Coach" beats a generic "Task". */
  taskLabel: string
  /** Last graded attempt. Absent until the student has been graded once. */
  result?: ReactNode
  /** Pass state of that attempt, so the tab can say which it was without color. */
  resultPassed?: boolean
  /** Navigational aside (other exercises). Always last. */
  related?: ReactNode
  /** Which panel opens first on a phone. */
  initialPanel?: WorkspacePanel
  /**
   * Bump after a fresh grade lands. On a phone the student submits from the
   * task panel and the verdict arrives in a panel they cannot see, so without
   * this a submission looks like it did nothing.
   */
  revealResultNonce?: number
  /** Lead the work pane with the result. For a student reading a review, not
   * about to work — the task then trails it as the way to go again. */
  resultFirst?: boolean
  /** The task fills the work pane edge to edge and top to bottom (the code
   * editor). Otherwise the pane is a padded reading column. */
  fillTask?: boolean
}

const WIDTH_KEY = 'exercise-brief-width'
const MIN_PCT = 24
const MAX_PCT = 60
const DEFAULT_PCT = 38
const WIDTH_EVENT = 'exercise-brief-width-change'

// The pane width is a per-viewer convenience kept in localStorage, read through
// useSyncExternalStore so the server render and first paint agree on the
// default. Storage can be blocked, so the last value is also held in memory.
let memoryPct: number | null = null

function readBriefPct() {
  if (memoryPct !== null) return memoryPct
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    if (saved >= MIN_PCT && saved <= MAX_PCT) return saved
  } catch {}
  return DEFAULT_PCT
}

function subscribeBriefPct(onChange: () => void) {
  window.addEventListener(WIDTH_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(WIDTH_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * The shared frame for a standalone exercise.
 *
 * From `lg` up it is the coding-site idiom: a full-height shell with the
 * instructions in a pane on the left and the work on the right, each scrolling
 * on its own, split by a divider the student can drag. The instructions never
 * leave the screen while they work, and nothing on the page competes for where
 * to look first — left is read, right is do. Phones get one panel at a time
 * behind a segmented control.
 *
 * Both layouts render ONE tree — the panels are shown and hidden with CSS
 * rather than mounted and unmounted. A tab switch that remounted the panel
 * would drop the coach conversation, the artifact iframe's internal state, and
 * any half-typed answer.
 *
 * Not ARIA tabs: at `lg` every panel is visible at once, which is not a valid
 * tablist, and roles cannot be varied by media query. A toggle group is honest
 * in both layouts and each button stays directly reachable by Tab.
 *
 * The parent must give this a height from `lg` up (the page does:
 * `100dvh` less the dashboard header).
 */
export default function ExerciseWorkspace({
  header,
  brief,
  task,
  taskLabel,
  result,
  resultPassed,
  related,
  initialPanel = 'brief',
  revealResultNonce = 0,
  resultFirst = false,
  fillTask = false,
}: ExerciseWorkspaceProps) {
  const t = useTranslations('exercises.workspace')
  const [panel, setPanel] = useState<WorkspacePanel>(
    initialPanel === 'result' && !result ? 'task' : initialPanel
  )
  const resultRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const briefPct = useSyncExternalStore(subscribeBriefPct, readBriefPct, () => DEFAULT_PCT)
  const [dragging, setDragging] = useState(false)

  const commitWidth = (pct: number) => {
    const next = Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(pct)))
    memoryPct = next
    try {
      localStorage.setItem(WIDTH_KEY, String(next))
    } catch {}
    window.dispatchEvent(new Event(WIDTH_EVENT))
  }

  const onDividerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !shellRef.current) return
    const box = shellRef.current.getBoundingClientRect()
    commitWidth(((e.clientX - box.left) / box.width) * 100)
  }

  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') commitWidth(briefPct - 2)
    else if (e.key === 'ArrowRight') commitWidth(briefPct + 2)
    else if (e.key === 'Home') commitWidth(MIN_PCT)
    else if (e.key === 'End') commitWidth(MAX_PCT)
    else return
    e.preventDefault()
  }

  // Only on a *change*: the mount value is the attempt they arrived with, and
  // `initialPanel` has already decided what to do about that one.
  const lastReveal = useRef(revealResultNonce)
  useEffect(() => {
    if (revealResultNonce !== lastReveal.current) {
      lastReveal.current = revealResultNonce
      setPanel('result')
      // The work pane scrolls on its own, so the verdict can land out of view.
      requestAnimationFrame(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        resultRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      })
    }
  }, [revealResultNonce])

  const tabs: { id: WorkspacePanel; label: string; icon: ReactNode }[] = [
    // No icon: it carries no state, and the 20px it costs truncated
    // "Instrucciones" inside a third of a 390px screen.
    { id: 'brief', label: t('brief'), icon: null },
    { id: 'task', label: taskLabel, icon: null },
    ...(result
      ? [
          {
            id: 'result' as const,
            label: t('result'),
            // Icon, not a colored dot: pass state may not be carried by color
            // alone, and the shapes match the ones on the result card itself.
            icon: resultPassed ? (
              <IconCheck size={14} className="text-success" aria-hidden="true" />
            ) : (
              <IconTarget size={14} className="text-warning" aria-hidden="true" />
            ),
          },
        ]
      : []),
  ]

  // "Try again" clears the result while the student is looking at it; without
  // this the phone would show an empty screen and no selected tab.
  const active = panel === 'result' && !result ? 'task' : panel

  /** Visible on a phone only when selected; always visible from `lg` up. */
  const panelClass = (id: WorkspacePanel) => cn(active === id ? 'block' : 'hidden', 'lg:block')

  return (
    <div
      ref={shellRef}
      // A phone is a one-column grid whose children are re-ordered; from `lg`
      // up it is the two-pane shell. `--brief-w` only applies there.
      className={cn(
        'grid grid-cols-1 gap-4 sm:gap-6 lg:flex lg:h-full lg:min-h-0 lg:gap-0',
        dragging && 'lg:select-none'
      )}
      style={{ '--brief-w': `${briefPct}%` } as React.CSSProperties}
    >
      {/* Sticky so switching back to the brief mid-answer costs one tap and no
          scrolling. The dashboard header is static, so top-0 is clear. */}
      <div
        role="group"
        aria-label={t('sections')}
        className="order-1 lg:hidden sticky top-0 z-20 -mx-3 px-3 py-2 bg-background"
      >
        <div
          className="grid gap-1 rounded-lg bg-muted p-1"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const selected = active === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPanel(tab.id)}
                aria-pressed={selected}
                // 36px: the segmented control is the most-tapped thing on this
                // screen and the default 32px sits under every touch guideline.
                className={cn(
                  'flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  // Weight carries the selection alongside the fill, so it
                  // survives a tenant palette and reads without color.
                  selected
                    ? 'bg-background text-foreground font-semibold shadow-sm'
                    : // Not `text-muted-foreground`: over the `bg-muted` track
                      // it measured 4.39:1, just under AA for 12px.
                      'text-foreground/75 font-medium hover:text-foreground'
                )}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* `contents` on a phone so each block is its own grid child and can be
          ordered around the tab bar; from `lg` up it is the instructions pane. */}
      <aside
        aria-label={t('brief')}
        className="contents lg:block lg:w-[var(--brief-w)] lg:shrink-0 lg:space-y-8 lg:overflow-y-auto lg:py-6 lg:pr-8"
      >
        <div className="order-0">{header}</div>

        <section aria-label={t('brief')} className={cn(panelClass('brief'), 'order-2')}>
          {brief}
        </section>

        {related && (
          // Links away from the exercise trail the brief; the work pane stays
          // free of exit ramps.
          <div className={cn(panelClass('brief'), 'order-last')}>{related}</div>
        )}
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('resize')}
        aria-valuenow={briefPct}
        aria-valuemin={MIN_PCT}
        aria-valuemax={MAX_PCT}
        tabIndex={0}
        onKeyDown={onDividerKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerMove={onDividerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => commitWidth(DEFAULT_PCT)}
        // A 1px hairline with a 12px grab area around it.
        className={cn(
          'group relative hidden w-3 shrink-0 cursor-col-resize touch-none lg:block',
          'focus-visible:outline-none'
        )}
      >
        <span
          className={cn(
            'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors',
            'group-hover:w-0.5 group-hover:bg-foreground/40 group-focus-visible:w-0.5 group-focus-visible:bg-ring',
            dragging && 'w-0.5 bg-foreground/40'
          )}
        />
      </div>

      <div
        className={cn(
          'contents lg:block lg:min-w-0 lg:flex-1 lg:overflow-y-auto',
          fillTask ? 'lg:overflow-hidden' : 'lg:py-6 lg:pl-8'
        )}
      >
        <div
          className={cn(
            'contents lg:flex lg:flex-col',
            fillTask ? 'lg:h-full' : 'lg:max-w-3xl lg:gap-8'
          )}
        >
          {result && (
            // A plain div — the result card is already a labelled region, and
            // wrapping it in a second one just duplicates the landmark.
            <div
              ref={resultRef}
              className={cn(
                panelClass('result'),
                resultFirst ? 'order-2' : 'order-3',
                'scroll-mt-6',
                fillTask && 'lg:shrink-0 lg:px-6 lg:py-4'
              )}
            >
              {result}
            </div>
          )}

          <section
            aria-label={taskLabel}
            className={cn(
              panelClass('task'),
              resultFirst ? 'order-3' : 'order-2',
              fillTask && 'lg:min-h-0 lg:flex-1'
            )}
          >
            {task}
          </section>
        </div>
      </div>
    </div>
  )
}

/**
 * Which panel a phone should open on.
 *
 * A student who has not been graded yet needs to read the task first. One who
 * came back to a failed attempt needs the feedback first — the same rule the
 * lesson checkpoints use to decide whether to auto-expand. Anyone else has
 * read the brief already and wants the work.
 */
export function initialWorkspacePanel(opts: {
  hasResult: boolean
  passed?: boolean
  attempted: boolean
}): WorkspacePanel {
  if (opts.hasResult && opts.passed === false) return 'result'
  if (opts.attempted) return 'task'
  return 'brief'
}
