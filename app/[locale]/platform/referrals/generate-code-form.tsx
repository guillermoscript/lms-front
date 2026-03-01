"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { generateReferralCode } from "@/app/actions/platform/referrals"

interface Tenant {
  id: string
  name: string
  slug: string
}

interface Props {
  tenants: Tenant[]
}

export function GenerateCodeForm({ tenants }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    tenantId: '',
    tenantName: '',
    code: '',
    discountMonths: 1,
    referrerRewardMonths: 1,
    maxUses: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await generateReferralCode({
        tenantId: form.tenantId || undefined,
        code: form.code || undefined,
        discountMonths: Number(form.discountMonths),
        referrerRewardMonths: Number(form.referrerRewardMonths),
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      })
      toast.success(`Code created: ${result.code}`)
      setForm({ tenantId: '', tenantName: '', code: '', discountMonths: 1, referrerRewardMonths: 1, maxUses: '' })
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="generate-code-form">
      <div>
        <Label>Owner School (optional)</Label>
        <Select
          value={form.tenantId || '_platform'}
          onValueChange={(v) => {
            if (!v) return
            if (v === '_platform') {
              setForm(p => ({ ...p, tenantId: '', tenantName: '' }))
            } else {
              const tenant = tenants.find(t => t.id === v)
              setForm(p => ({ ...p, tenantId: v, tenantName: tenant?.name || v }))
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Platform-level (no owner)">
              {form.tenantName || 'Platform-level (no owner)'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_platform">Platform-level (no owner)</SelectItem>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Custom Code (optional)</Label>
        <Input
          placeholder="Leave blank to auto-generate"
          value={form.code}
          onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
          className="font-mono"
          data-testid="referral-code-input"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Referee Discount (mo)</Label>
          <Input
            type="number"
            min="1"
            max="12"
            value={form.discountMonths}
            onChange={(e) => setForm(p => ({ ...p, discountMonths: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Referrer Reward (mo)</Label>
          <Input
            type="number"
            min="1"
            max="12"
            value={form.referrerRewardMonths}
            onChange={(e) => setForm(p => ({ ...p, referrerRewardMonths: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Max Uses (∞ if blank)</Label>
          <Input
            type="number"
            min="1"
            placeholder="∞"
            value={form.maxUses}
            onChange={(e) => setForm(p => ({ ...p, maxUses: e.target.value }))}
          />
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full" data-testid="generate-code-submit">
        {loading ? 'Generating…' : 'Generate Referral Code'}
      </Button>
    </form>
  )
}
