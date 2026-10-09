'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

/**
 * Clipboard API first; the hidden-textarea fallback covers insecure contexts,
 * denied permissions and headless browsers. Resolves false only when both fail.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.setAttribute('aria-hidden', 'true')
    area.className = 'fixed left-0 top-0 opacity-0'
    // Inside an open dialog, so its focus trap doesn't fight the selection.
    const host = document.activeElement?.closest('[role="dialog"]') ?? document.body
    host.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    host.removeChild(area)
    return ok
  } catch {
    return false
  }
}

type CopyState = 'idle' | 'copied' | 'failed'

const ICON: Record<CopyState, typeof IconCopy> = { idle: IconCopy, copied: IconCheck, failed: IconAlertCircle }
const TEXT_KEY: Record<CopyState, 'copy' | 'copied' | 'copyFailed'> = { idle: 'copy', copied: 'copied', failed: 'copyFailed' }

/** Copy one value; always says what happened ("Copied" / "Couldn't copy"), announced via aria-live. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const tb = useTranslations('platformFees.payNow.bank')
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copy() {
    const ok = await copyText(value)
    setState(ok ? 'copied' : 'failed')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), ok ? 1500 : 3000)
  }

  const Icon = ICON[state]
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void copy()}
      aria-label={label}
      className={state === 'failed' ? 'text-destructive' : undefined}
      data-copy-state={state}
    >
      <Icon aria-hidden />
      <span aria-live="polite">{tb(TEXT_KEY[state])}</span>
    </Button>
  )
}
