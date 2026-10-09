'use client'

import { useRouter } from 'next/navigation'
import { IconPrinter, IconRefresh } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

/** Re-runs the server component after a failed balance read. */
export function FeeRetryButton({ label }: { label: string }) {
  const router = useRouter()
  return (
    <Button size="sm" variant="outline" onClick={() => router.refresh()} data-testid="fee-balance-retry">
      <IconRefresh className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}

/** Opens the browser print dialog for the statement. */
export function PrintStatementButton({ label }: { label: string }) {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden" data-testid="fee-statement-print">
      <IconPrinter className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}
