"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconDotsVertical } from "@tabler/icons-react"
import { suspendTenant } from "@/app/actions/platform/plans"
import { BillingModeDialog } from "@/components/platform/billing-mode-dialog"
import { ImpersonateDialog } from "./impersonate-dialog"

interface TenantActionsMenuProps {
  tenantId: string
  tenantName: string
  currentPlan: string
  isActive: boolean
  billingMode?: string | null
  compedUntil?: string | null
  feePercentOverride?: number | null
}

export function TenantActionsMenu({
  tenantId,
  tenantName,
  currentPlan,
  isActive,
  billingMode,
  compedUntil,
  feePercentOverride,
}: TenantActionsMenuProps) {
  const router = useRouter()
  const [showBillingModal, setShowBillingModal] = useState(false)
  const [showImpersonate, setShowImpersonate] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSuspend() {
    setLoading(true)
    try {
      await suspendTenant(tenantId, isActive)
      toast.success(isActive ? 'Tenant suspended' : 'Tenant reactivated')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <IconDotsVertical className="h-4 w-4" />
          </Button>
        } />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`./tenants/${tenantId}`)}>
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowImpersonate(true)}>
            Impersonate User
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowBillingModal(true)} data-testid="tenant-billing-mode-action">
            Billing mode
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSuspend}
            className={isActive ? 'text-destructive' : 'text-green-600'}
          >
            {isActive ? 'Suspend Tenant' : 'Reactivate Tenant'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showBillingModal && (
        <BillingModeDialog
          open={showBillingModal}
          onOpenChange={setShowBillingModal}
          tenantId={tenantId}
          tenantName={tenantName}
          currentMode={billingMode}
          currentPlan={currentPlan}
          currentUntil={compedUntil}
          currentFee={feePercentOverride}
        />
      )}

      {/* Impersonate Dialog */}
      <ImpersonateDialog
        open={showImpersonate}
        onClose={() => setShowImpersonate(false)}
        tenantId={tenantId}
        tenantName={tenantName}
      />
    </>
  )
}
