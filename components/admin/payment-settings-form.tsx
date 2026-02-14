'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateSettings } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface PaymentSettingsFormProps {
  settings: Record<string, any>
}

export default function PaymentSettingsForm({ settings }: PaymentSettingsFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Extract current values
  const stripeEnabled = settings.stripe_enabled?.value?.enabled ?? true
  const paypalEnabled = settings.paypal_enabled?.value?.enabled ?? false
  const currency = settings.currency?.value?.value || 'USD'
  const taxRate = settings.tax_rate?.value?.value || 0
  const invoicePrefix = settings.invoice_prefix?.value?.value || 'INV'
  const requirePaymentApproval = settings.require_payment_approval?.value?.enabled ?? false

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      const updatedSettings = {
        stripe_enabled: { enabled: formData.get('stripe_enabled') === 'on' },
        paypal_enabled: { enabled: formData.get('paypal_enabled') === 'on' },
        currency: { value: formData.get('currency') as string },
        tax_rate: { value: parseFloat(formData.get('tax_rate') as string) },
        invoice_prefix: { value: formData.get('invoice_prefix') as string },
        require_payment_approval: { enabled: formData.get('require_payment_approval') === 'on' },
      }

      const result = await updateSettings(updatedSettings)

      if (result.success) {
        toast.success('Payment settings updated successfully')
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update settings')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Payment Processors */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="font-semibold">Payment Processors</h3>

        {/* Stripe */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="stripe_enabled">Stripe</Label>
            <p className="text-sm text-muted-foreground">
              Enable Stripe payment processing
            </p>
          </div>
          <Switch
            id="stripe_enabled"
            name="stripe_enabled"
            defaultChecked={stripeEnabled}
          />
        </div>

        {/* PayPal */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="paypal_enabled">PayPal</Label>
            <p className="text-sm text-muted-foreground">
              Enable PayPal payment processing
            </p>
          </div>
          <Switch
            id="paypal_enabled"
            name="paypal_enabled"
            defaultChecked={paypalEnabled}
          />
        </div>
      </div>

      {/* Currency Settings */}
      <div className="space-y-2">
        <Label htmlFor="currency">Default Currency</Label>
        <Select name="currency" defaultValue={currency}>
          <SelectTrigger>
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD - US Dollar</SelectItem>
            <SelectItem value="EUR">EUR - Euro</SelectItem>
            <SelectItem value="GBP">GBP - British Pound</SelectItem>
            <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
            <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
            <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
            <SelectItem value="INR">INR - Indian Rupee</SelectItem>
            <SelectItem value="MXN">MXN - Mexican Peso</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Default currency for all transactions
        </p>
      </div>

      {/* Tax Rate */}
      <div className="space-y-2">
        <Label htmlFor="tax_rate">Tax Rate (%)</Label>
        <Input
          id="tax_rate"
          name="tax_rate"
          type="number"
          min="0"
          max="100"
          step="0.01"
          defaultValue={taxRate}
          placeholder="0"
        />
        <p className="text-sm text-muted-foreground">
          Default tax rate percentage applied to transactions (0 = no tax)
        </p>
      </div>

      {/* Invoice Settings */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="font-semibold">Invoice Settings</h3>

        {/* Invoice Prefix */}
        <div className="space-y-2">
          <Label htmlFor="invoice_prefix">Invoice Prefix</Label>
          <Input
            id="invoice_prefix"
            name="invoice_prefix"
            defaultValue={invoicePrefix}
            placeholder="INV"
            required
          />
          <p className="text-sm text-muted-foreground">
            Prefix for invoice numbers (e.g., INV-001, INV-002)
          </p>
        </div>
      </div>

      {/* Payment Approval */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="require_payment_approval">Require Payment Approval</Label>
          <p className="text-sm text-muted-foreground">
            Require admin approval before processing payments
          </p>
        </div>
        <Switch
          id="require_payment_approval"
          name="require_payment_approval"
          defaultChecked={requirePaymentApproval}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  )
}
