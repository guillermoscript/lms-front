'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { convertCompedTenantToPaid } from '@/app/actions/platform/plans'

/** Comped -> paid. Keeps the plan; clears the comp metadata and fee override. */
export function ConvertToPaidButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function convert() {
    if (!window.confirm(`Convert ${tenantName} to paid? Normal billing and the plan's fee apply again.`)) return
    setLoading(true)
    try {
      await convertCompedTenantToPaid(tenantId)
      toast.success('Converted to paid')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to convert')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={convert}
      disabled={loading}
      data-testid="billing-mode-convert-paid"
    >
      {loading ? 'Converting…' : 'Convert to paid'}
    </Button>
  )
}
