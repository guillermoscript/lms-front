'use client'

import { Component, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Persona, type PersonaState } from '@/components/ai-elements/persona'
import { cn } from '@/lib/utils'

/** Plain pulsing orb for devices where the Rive/WebGL2 avatar can't run. */
function OrbFallback({ state, className }: { state: PersonaState; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center', className)} aria-hidden="true">
      <div
        className={cn(
          'size-1/2 rounded-full bg-brand-tint ring-2 ring-foreground/20 transition-transform duration-500',
          state === 'speaking' && 'scale-125 animate-pulse motion-reduce:animate-none',
          state === 'listening' && 'scale-110 ring-brand-text/60',
          state === 'thinking' && 'animate-pulse motion-reduce:animate-none',
          state === 'asleep' && 'opacity-50'
        )}
      />
    </div>
  )
}

class PersonaBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function supportsWebGl2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    return false
  }
}

/**
 * The avatar is decoration: a phone without WebGL2, a blocked .riv download or a
 * lost GL context must never take the whole exercise page down with it.
 */
export function SafePersona(props: { state: PersonaState; variant?: 'halo'; className?: string }) {
  const webgl = useSyncExternalStore(() => () => {}, supportsWebGl2, () => false)
  const [loadFailed, setLoadFailed] = useState(false)

  const fallback = <OrbFallback state={props.state} className={props.className} />
  if (!webgl || loadFailed) return fallback
  return (
    <PersonaBoundary fallback={fallback}>
      <Persona {...props} onLoadError={() => setLoadFailed(true)} />
    </PersonaBoundary>
  )
}
