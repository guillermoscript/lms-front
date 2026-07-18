'use client'

import { useState, useSyncExternalStore } from 'react'
import * as motion from 'motion/react-client'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IconCheck, IconX, IconArrowRight } from '@tabler/icons-react'
import { setUiState } from '@/app/actions/ui-state'

export interface OnboardingStep {
  id: string
  label: string
  description?: string
  href: string
  completed: boolean
}

interface OnboardingChecklistProps {
  /** Unique key for the localStorage optimistic cache (e.g., "teacher-onboarding") */
  storageKey: string
  /** user_ui_state key (e.g. checklistStateKey('admin')) — dismissal persists server-side */
  stateKey?: string
  /** Server-persisted dismissal, read in the page. localStorage is only a cache on top. */
  dismissed?: boolean
  title: string
  subtitle?: string
  steps: OnboardingStep[]
  /** Optional slot rendered below the steps (e.g., a link to the guided wizard) */
  footer?: React.ReactNode
}

export function OnboardingChecklist({ storageKey, stateKey, dismissed = false, title, subtitle, steps, footer }: OnboardingChecklistProps) {
  // The server-provided `dismissed` prop decides the SSR output (no hydration
  // flash). The localStorage cache only papers over the window where a
  // dismissal hasn't round-tripped to the server yet; server value wins.
  const cachedDismissed = useSyncExternalStore(
    () => () => undefined,
    () => localStorage.getItem(`onboarding-dismissed:${storageKey}`) === 'true',
    () => false,
  )
  const [dismissedNow, setDismissedNow] = useState(false)
  const isDismissed = dismissed || cachedDismissed || dismissedNow

  const completedCount = steps.filter(s => s.completed).length
  const allDone = completedCount === steps.length

  if (isDismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(`onboarding-dismissed:${storageKey}`, 'true')
    setDismissedNow(true)
    if (stateKey) void setUiState(stateKey, 'dismissed')
  }

  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="relative overflow-hidden border-primary/20 bg-primary/[0.02]">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              <IconX className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums shrink-0">
              {completedCount}/{steps.length}
            </span>
          </div>

          {/* Steps */}
          <div className="space-y-1">
            {steps.map((step) => (
              <Link
                key={step.id}
                href={step.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-primary/5 ${step.completed
                    ? 'opacity-60'
                    : ''
                  }`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${step.completed
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30 group-hover:border-primary/50'
                    }`}
                >
                  {step.completed && <IconCheck className="h-3 w-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium transition-colors group-hover:text-primary ${step.completed ? 'line-through' : ''}`}>
                    {step.label}
                  </p>
                  {step.description && !step.completed && (
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  )}
                </div>
                <IconArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
              </Link>
            ))}
          </div>

          {/* All done message */}
          {allDone && (
            <div className="mt-3 pt-3 border-t text-center">
              <p className="text-xs text-muted-foreground">
                All done! You can dismiss this checklist.
              </p>
            </div>
          )}

          {footer && (
            <div className="mt-3 pt-3 border-t">
              {footer}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
