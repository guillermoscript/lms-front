'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getRoutingNumberLabel, SUPPORTED_CURRENCIES } from '@/lib/currency'
import { IconBuildingBank } from '@tabler/icons-react'

interface BankDetails {
  bank_name: string
  account_holder: string
  account_number: string
  routing_number: string
  country: string
  currency: string
  additional_notes: string
}

interface BankDetailsFormProps {
  initialData?: Partial<BankDetails>
  onSave: (details: BankDetails) => Promise<void>
}

const COUNTRIES = [
  { code: 'MX', name: 'Mexico' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Peru' },
  { code: 'AR', name: 'Argentina' },
  { code: 'BR', name: 'Brazil' },
  { code: 'US', name: 'United States' },
]

export function BankDetailsForm({ initialData, onSave }: BankDetailsFormProps) {
  const [details, setDetails] = useState<BankDetails>({
    bank_name: initialData?.bank_name || '',
    account_holder: initialData?.account_holder || '',
    account_number: initialData?.account_number || '',
    routing_number: initialData?.routing_number || '',
    country: initialData?.country || 'MX',
    currency: initialData?.currency || 'usd',
    additional_notes: initialData?.additional_notes || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(details)
    } finally {
      setSaving(false)
    }
  }

  const update = (field: keyof BankDetails, value: string) => {
    setDetails((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBuildingBank className="h-5 w-5" />
          Bank Details for Manual Payments
        </CardTitle>
        <CardDescription>
          These details will be shown to students who choose to pay via bank transfer
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select value={details.country} onValueChange={(v) => v && update('country', v)}>
                <SelectTrigger id="country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={details.currency} onValueChange={(v) => v && update('currency', v)}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code.toUpperCase()} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankName">Bank Name</Label>
            <Input
              id="bankName"
              value={details.bank_name}
              onChange={(e) => update('bank_name', e.target.value)}
              placeholder="e.g. BBVA, Bancolombia, Santander"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountHolder">Account Holder Name</Label>
            <Input
              id="accountHolder"
              value={details.account_holder}
              onChange={(e) => update('account_holder', e.target.value)}
              placeholder="Full name as it appears on the bank account"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                value={details.account_number}
                onChange={(e) => update('account_number', e.target.value)}
                placeholder="Account number"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="routingNumber">{getRoutingNumberLabel(details.country)}</Label>
              <Input
                id="routingNumber"
                value={details.routing_number}
                onChange={(e) => update('routing_number', e.target.value)}
                placeholder={getRoutingNumberLabel(details.country)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additionalNotes">Additional Notes</Label>
            <Textarea
              id="additionalNotes"
              value={details.additional_notes}
              onChange={(e) => update('additional_notes', e.target.value)}
              placeholder="e.g. Include your student ID in the transfer reference"
              rows={3}
            />
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Bank Details'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
