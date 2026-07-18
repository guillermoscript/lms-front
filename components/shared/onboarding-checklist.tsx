'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import * as motion from 'motion/react-client'
import { useReducedMotion } from 'motion/react'
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconConfetti,
  IconCopy,
  IconExternalLink,
  IconX,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { setUiState } from '@/app/actions/ui-state'
import { Card, CardContent } from '@/components/ui/card'
import { getChecklistState } from '@/lib/onboarding-checklist'

export interface OnboardingStep {
  id: string
  label: string
  description?: string
  href: string
  completed: boolean
  timeHint?: string
}

interface OnboardingMilestone {
  stepId: string
  title: string
  description: string
  href: string
  copyLabel: string
  copiedLabel: string
  viewLabel: string
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
  milestone?: OnboardingMilestone
  /** Optional slot rendered below the steps (e.g., a link to the guided wizard) */
  footer?: React.ReactNode
}

export function OnboardingChecklist({
  storageKey,
  stateKey,
  dismissed = false,
  title,
  subtitle,
  steps,
  milestone,
  footer,
}: OnboardingChecklistProps) {
  const t = useTranslations('common.onboardingChecklist')
  const prefersReducedMotion = useReducedMotion()
  // The server-provided `dismissed` prop decides the SSR output (no hydration
  // flash). The localStorage cache only papers over the window where a
  // dismissal hasn't round-tripped to the server yet; server value wins.
  const cachedDismissed = useSyncExternalStore(
    () => () => undefined,
    () => localStorage.getItem(`onboarding-dismissed:${storageKey}`) === 'true',
    () => false,
  )
  const [dismissedNow, setDismissedNow] = useState(false)
  const [copied, setCopied] = useState(false)
  const isDismissed = dismissed || cachedDismissed || dismissedNow
  const {
    allDone,
    completedCount,
    completedSteps,
    nextStep,
    upcomingSteps,
  } = getChecklistState(steps)
  const milestoneStep = milestone
    ? steps.find((step) => step.id === milestone.stepId)
    : undefined
  const showMilestone = Boolean(milestone && milestoneStep?.completed)

  if (isDismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(`onboarding-dismissed:${storageKey}`, 'true')
    setDismissedNow(true)
    if (stateKey) void setUiState(stateKey, 'dismissed')
  }

  const handleCopyMilestone = async () => {
    if (!milestone) return

    const shareUrl = new URL(milestone.href, window.location.origin).toString()
    let usedClipboardApi = false
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl)
        usedClipboardApi = true
      } catch {
        // HTTP development origins may expose Clipboard API but reject writes.
      }
    }

    if (!usedClipboardApi) {
      const textarea = document.createElement('textarea')
      textarea.value = shareUrl
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
    >
      <Card className="relative overflow-hidden border-primary/20 bg-primary/[0.02]">
        <CardContent className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              {subtitle && (
                <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              aria-label={t('dismiss')}
            >
              <IconX className="size-4" />
            </Button>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {completedCount}/{steps.length}
            </span>
          </div>

          {showMilestone && milestone && (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
              className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"
              data-testid="onboarding-milestone"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <IconConfetti className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-emerald-950 dark:text-emerald-50">
                    {milestone.title}
                  </p>
                  <p className="mt-1 text-xs text-emerald-900/70 dark:text-emerald-100/70">
                    {milestone.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyMilestone}
                      data-testid="copy-course-link"
                    >
                      {copied ? <IconCheck /> : <IconCopy />}
                      {copied ? milestone.copiedLabel : milestone.copyLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      nativeButton={false}
                      render={<Link href={milestone.href} />}
                    >
                      {milestone.viewLabel}
                      <IconExternalLink />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {nextStep && (
            <div
              className="rounded-xl border border-primary/25 bg-background p-4 shadow-sm"
              data-testid="onboarding-next-step"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {t('nextAction')}
                </p>
                {nextStep.timeHint && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <IconClock className="size-3" aria-hidden="true" />
                    {nextStep.timeHint}
                  </span>
                )}
              </div>
              <h4 className="mt-2 text-base font-semibold tracking-tight">
                {nextStep.label}
              </h4>
              {nextStep.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {nextStep.description}
                </p>
              )}
              <Button
                className="mt-4 h-auto w-full whitespace-normal py-2 sm:w-auto"
                size="lg"
                nativeButton={false}
                render={<Link href={nextStep.href} />}
              >
                {t('doThisNext', { step: nextStep.label })}
                <IconArrowRight />
              </Button>
            </div>
          )}

          {completedSteps.length > 0 && (
            <div className="mt-3 space-y-1" aria-label={t('completedSteps')}>
              {completedSteps.map((step) => (
                <Link
                  key={step.id}
                  href={step.href}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                >
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <IconCheck className="size-3" />
                  </div>
                  <p className="min-w-0 flex-1 text-xs font-medium line-through decoration-muted-foreground/50">
                    {step.label}
                  </p>
                  <IconArrowRight className="size-3.5 shrink-0 opacity-50 transition-colors group-hover:text-primary" />
                </Link>
              ))}
            </div>
          )}

          {upcomingSteps.length > 0 && (
            <details className="group mt-3 rounded-lg border border-border/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                {t('remainingSteps', { count: upcomingSteps.length })}
                <IconChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="space-y-1 border-t px-1 py-1">
                {upcomingSteps.map((step) => (
                  <Link
                    key={step.id}
                    href={step.href}
                    className="group/step flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-primary/5"
                  >
                    <div className="size-5 shrink-0 rounded-full border border-muted-foreground/30" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{step.label}</p>
                      {step.timeHint && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <IconClock className="size-3" aria-hidden="true" />
                          {step.timeHint}
                        </p>
                      )}
                    </div>
                    <IconArrowRight className="size-3.5 text-muted-foreground/50 transition-colors group-hover/step:text-primary" />
                  </Link>
                ))}
              </div>
            </details>
          )}

          {allDone && (
            <div className="mt-3 border-t pt-3 text-center">
              <p className="text-xs text-muted-foreground">{t('allDone')}</p>
            </div>
          )}

          {footer && (
            <div className="mt-3 border-t pt-3">{footer}</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
