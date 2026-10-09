'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

/**
 * Legacy copy: a textarea inside the active dialog (a focus-trapped dialog
 * refuses focus on nodes outside it), selected and copied synchronously.
 */
function legacyCopy(value: string, anchor: HTMLElement | null): boolean {
  const host = anchor?.closest<HTMLElement>('[role="dialog"]') ?? document.body
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = value
  area.readOnly = false
  area.setAttribute('aria-hidden', 'true')
  area.tabIndex = -1
  area.className = 'pointer-events-none fixed left-0 top-0 size-px opacity-0'
  host.appendChild(area)
  try {
    area.focus({ preventScroll: true })
    area.select()
    area.setSelectionRange(0, value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    host.removeChild(area)
    previous?.focus({ preventScroll: true })
  }
}

/** Select a visible element's text so the user can press Cmd/Ctrl+C. */
function selectVisibleText(id: string | undefined): boolean {
  const el = id ? document.getElementById(id) : null
  const selection = window.getSelection()
  if (!el || !selection) return false
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

/**
 * Clipboard API first (secure contexts), then the legacy path. The legacy copy
 * runs before any await resolves only when the API is absent, so it stays
 * inside the click's user activation. Resolves false when both fail.
 */
export function copyText(value: string, anchor: HTMLElement | null = null): boolean | Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).then(
      () => true,
      () => legacyCopy(value, anchor),
    )
  }
  return legacyCopy(value, anchor)
}

type CopyState = 'idle' | 'copied' | 'manual'

const ICON: Record<CopyState, typeof IconCopy> = { idle: IconCopy, copied: IconCheck, manual: IconAlertCircle }
const TEXT_KEY: Record<CopyState, 'copy' | 'copied' | 'copyManual'> = { idle: 'copy', copied: 'copied', manual: 'copyManual' }

/**
 * Copy one value; always says what happened, announced via aria-live. When
 * every copy path fails it selects the visible text (`sourceId`) and asks for
 * Ctrl/Cmd+C instead of a hard failure.
 */
export function CopyButton({ value, label, sourceId }: { value: string; label: string; sourceId?: string }) {
  const tb = useTranslations('platformFees.payNow.bank')
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copy(button: HTMLElement) {
    const ok = await copyText(value, button)
    if (!ok) selectVisibleText(sourceId)
    setState(ok ? 'copied' : 'manual')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), ok ? 1500 : 5000)
  }

  const Icon = ICON[state]
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={(e) => void copy(e.currentTarget)}
      aria-label={label}
      className={state === 'manual' ? 'text-destructive' : undefined}
      data-copy-state={state}
    >
      <Icon aria-hidden />
      <span aria-live="polite">{tb(TEXT_KEY[state])}</span>
    </Button>
  )
}
