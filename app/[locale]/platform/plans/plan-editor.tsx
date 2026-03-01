"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updatePlatformPlan, togglePlanActive } from "@/app/actions/platform/plans"

interface Plan {
  plan_id: string
  name: string
  slug: string
  price_monthly: number
  price_yearly: number
  transaction_fee_percent: number
  limits: Record<string, unknown>
  is_active: boolean
  sort_order: number
}

interface Props {
  plan: Plan
}

export function PlanEditor({ plan }: Props) {
  const router = useRouter()
  const [showEdit, setShowEdit] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: plan.name,
    price_monthly: plan.price_monthly,
    price_yearly: plan.price_yearly,
    transaction_fee_percent: plan.transaction_fee_percent,
    sort_order: plan.sort_order ?? 0,
    limits_json: JSON.stringify(plan.limits, null, 2),
  })

  async function handleSave() {
    setLoading(true)
    try {
      let parsedLimits = plan.limits
      try {
        parsedLimits = JSON.parse(formData.limits_json)
      } catch {
        toast.error('Invalid JSON in limits field')
        setLoading(false)
        return
      }
      await updatePlatformPlan(plan.plan_id, {
        name: formData.name,
        price_monthly: Number(formData.price_monthly),
        price_yearly: Number(formData.price_yearly),
        transaction_fee_percent: Number(formData.transaction_fee_percent),
        sort_order: Number(formData.sort_order),
        limits: parsedLimits,
      })
      toast.success('Plan updated')
      setShowEdit(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive() {
    setLoading(true)
    try {
      await togglePlanActive(plan.plan_id, !plan.is_active)
      toast.success(plan.is_active ? 'Plan deactivated' : 'Plan activated')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex gap-2 pt-2 border-t">
        <Button size="sm" variant="outline" onClick={() => setShowEdit(true)} className="flex-1" data-testid="plan-edit-btn">
          Edit
        </Button>
        <Button
          size="sm"
          variant={plan.is_active ? 'ghost' : 'outline'}
          onClick={handleToggleActive}
          disabled={loading}
          className="flex-1"
          data-testid="plan-toggle-btn"
        >
          {plan.is_active ? 'Deactivate' : 'Activate'}
        </Button>
      </div>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg" data-testid="plan-edit-dialog">
          <DialogHeader>
            <DialogTitle>Edit Plan — {plan.slug}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(p => ({ ...p, sort_order: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Monthly Price (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price_monthly}
                  onChange={(e) => setFormData(p => ({ ...p, price_monthly: Number(e.target.value) }))}
                  data-testid="plan-price-monthly-input"
                />
              </div>
              <div>
                <Label>Yearly Price (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price_yearly}
                  onChange={(e) => setFormData(p => ({ ...p, price_yearly: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Txn Fee %</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.transaction_fee_percent}
                  onChange={(e) => setFormData(p => ({ ...p, transaction_fee_percent: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <Label>Limits (JSON)</Label>
              <textarea
                className="w-full border rounded-md p-2 text-xs font-mono bg-muted mt-1"
                rows={6}
                value={formData.limits_json}
                onChange={(e) => setFormData(p => ({ ...p, limits_json: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading} data-testid="plan-save-btn">
              {loading ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
