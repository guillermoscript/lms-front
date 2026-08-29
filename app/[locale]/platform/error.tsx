'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { IconAlertOctagon } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <IconAlertOctagon className="mx-auto mb-4 size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <h1 className="text-lg font-semibold tracking-tight">This page didn&rsquo;t load</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Something failed while loading platform data. Retrying usually fixes it; if not, the
          reference below points at the server log.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" render={<Link href="/platform" />}>
            Back to overview
          </Button>
        </div>
      </div>
    </div>
  )
}
