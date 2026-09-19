'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { joinCurrentSchool } from '@/app/actions/join-school'

interface AutoJoinSchoolProps {
  /** Display name of the school being joined, for the interstitial copy. */
  schoolName: string
  /** Same-origin path to land on once the membership exists. */
  destination: string
  /**
   * The manual join page. Rendered only when the automatic join could not
   * happen — a full seat count, a failed metadata write — so the visitor still
   * gets the explanation and a retry button.
   */
  children: React.ReactNode
}

/**
 * Joins the current school on arrival instead of asking for a click (#790).
 *
 * `proxy.ts` sends every logged-in non-member here from a protected route, so
 * by the time this renders the visitor has already navigated *into* the school
 * — the button on the manual form asked a question with one answer. The join
 * runs on mount and the page forwards to `destination`; the form underneath is
 * the failure path, not the happy one.
 *
 * Deliberately a client effect rather than a server-side join during render:
 * this is a membership write (and a seat against the school's plan), which
 * must not be triggered by a GET a crawler or a prefetch could make.
 */
export function AutoJoinSchool({ schoolName, destination, children }: AutoJoinSchoolProps) {
  const t = useTranslations('joinSchool')
  const [error, setError] = useState<string | null>(null)
  // Survives StrictMode's double-invoked effect, which would otherwise fire a
  // second join and surface its "already a member" refusal as a failure.
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    let cancelled = false
    joinCurrentSchool()
      .then((result) => {
        if (result.success) {
          // Hard navigation, matching JoinSchoolForm: the membership and the
          // JWT claims just changed, so the destination wants a fresh request
          // through proxy.ts rather than a client transition.
          window.location.assign(destination)
          return
        }
        if (!cancelled) setError(result.error || t('error'))
      })
      .catch((err) => {
        console.error('Auto-join failed:', err)
        if (!cancelled) setError(t('unexpectedError'))
      })

    return () => {
      cancelled = true
    }
  }, [destination, t])

  if (!error) {
    return (
      <div
        className="container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 py-12 text-center"
        data-testid="join-school-auto"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-lg font-medium" role="status">
          {t('autoJoining', { school: schoolName })}
        </p>
        <p className="text-sm text-muted-foreground">{t('terms', { school: schoolName })}</p>
      </div>
    )
  }

  return (
    <>
      <div className="container mx-auto max-w-2xl pt-12">
        <Alert variant="destructive" data-testid="join-school-auto-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
      {children}
    </>
  )
}
