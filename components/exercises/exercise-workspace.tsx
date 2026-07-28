'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { IconCheck, IconTarget } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export type WorkspacePanel = 'brief' | 'task' | 'result'

interface ExerciseWorkspaceProps {
  /** What the student has to do — instructions, criteria, prompt. */
  brief: ReactNode
  /** The doing surface: the coach chat, the artifact, the recorder. */
  task: ReactNode
  /** Names the task panel for this engine. "AI Coach" beats a generic "Task". */
  taskLabel: string
  /** Last graded attempt. Absent until the student has been graded once. */
  result?: ReactNode
  /** Pass state of that attempt, so the tab can say which it was without color. */
  resultPassed?: boolean
  /** Navigational aside (other exercises). Always last on mobile. */
  related?: ReactNode
  /** Which panel opens first on a phone. */
  initialPanel?: WorkspacePanel
  /**
   * Bump after a fresh grade lands. On a phone the student submits from the
   * task panel and the verdict arrives in a panel they cannot see, so without
   * this a submission looks like it did nothing.
   */
  revealResultNonce?: number
}

/**
 * The shared frame for a standalone exercise.
 *
 * Phones get one panel at a time behind a segmented control; from `lg` up the
 * same three panels lay out as columns, because there the brief can sit beside
 * the work instead of above it.
 *
 * Both layouts render ONE tree — the panels are shown and hidden with CSS
 * rather than mounted and unmounted. A tab switch that remounted the panel
 * would drop the coach conversation, the artifact iframe's internal state, and
 * any half-typed answer.
 *
 * Not ARIA tabs: at `lg` every panel is visible at once, which is not a valid
 * tablist, and roles cannot be varied by media query. A toggle group is honest
 * in both layouts and each button stays directly reachable by Tab.
 */
export default function ExerciseWorkspace({
  brief,
  task,
  taskLabel,
  result,
  resultPassed,
  related,
  initialPanel = 'brief',
  revealResultNonce = 0,
}: ExerciseWorkspaceProps) {
  const t = useTranslations('exercises.workspace')
  const [panel, setPanel] = useState<WorkspacePanel>(
    initialPanel === 'result' && !result ? 'task' : initialPanel
  )

  // Only on a *change*: the mount value is the attempt they arrived with, and
  // `initialPanel` has already decided what to do about that one.
  const lastReveal = useRef(revealResultNonce)
  useEffect(() => {
    if (revealResultNonce !== lastReveal.current) {
      lastReveal.current = revealResultNonce
      setPanel('result')
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
              <IconCheck size={14} className="text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <IconTarget size={14} className="text-amber-700 dark:text-amber-400" aria-hidden="true" />
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
      {/* Sticky so switching back to the brief mid-answer costs one tap and no
          scrolling. The dashboard header is static, so top-0 is clear. */}
      <div
        role="group"
        aria-label={t('sections')}
        className="order-first lg:hidden sticky top-0 z-20 -mx-3 px-3 py-2 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
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

      {/* `contents` on a phone so each panel is its own grid child and can be
          ordered independently; from `lg` up these wrappers become the two
          columns, which is what keeps the related list tucked under the brief
          instead of dropping to a row below the whole task. */}
      <div className="contents lg:block lg:col-span-4 lg:order-1 lg:space-y-6">
        <section aria-label={t('brief')} className={panelClass('brief')}>
          {brief}
        </section>

        {related && (
          // Links away from the exercise. They used to sit between the student
          // and the task itself; now they trail the brief, and the task and
          // result panels stay free of exit ramps.
          <div className={cn(panelClass('brief'), 'order-last lg:order-none')}>{related}</div>
        )}
      </div>

      <div className="contents lg:block lg:col-span-8 lg:order-2 lg:space-y-6">
        {result && (
          // Above the work it refers to, not across the top of the page: at
          // 1440px a full-width card left two thirds of its own row empty.
          // A plain div — the result card is already a labelled region, and
          // wrapping it in a second one just duplicates the landmark.
          <div className={panelClass('result')}>{result}</div>
        )}

        <section aria-label={taskLabel} className={panelClass('task')}>
          <div className="lg:sticky lg:top-6">{task}</div>
        </section>
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
