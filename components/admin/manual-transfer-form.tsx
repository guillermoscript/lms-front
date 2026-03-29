'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { IconBuildingBank, IconCheck } from '@tabler/icons-react'
import { ProofUpload } from '@/components/shared/proof-upload'

interface ManualTransferFormProps {
  planName: string
  amount: number
  interval: string
  onSubmit: (bankReference: string, notes: string) => Promise<void>
  onProofUpload?: (file: File) => Promise<void>
  onSuccess?: () => void
  onCancel: () => void
}

export function ManualTransferForm({
  planName,
  amount,
  interval,
  onSubmit,
  onProofUpload,
  onSuccess,
  onCancel,
}: ManualTransferFormProps) {
  const [bankReference, setBankReference] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(bankReference, notes)
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <IconCheck className="h-6 w-6 text-green-600" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold">Request Submitted</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Your upgrade request has been submitted. We&apos;ll send you bank transfer instructions shortly.
            </p>
          </div>
          <Button variant="outline" onClick={onSuccess || onCancel}>Back to Billing</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBuildingBank className="h-5 w-5" />
          Bank Transfer Request
        </CardTitle>
        <CardDescription>
          Upgrade to {planName} ({interval}) for ${amount}/{interval === 'yearly' ? 'year' : 'month'} via bank transfer
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-sm">
            <p>After submitting this request:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-muted-foreground">
              <li>We&apos;ll send bank transfer instructions to your billing email</li>
              <li>Make the transfer and provide the reference number</li>
              <li>Your plan will be activated once payment is confirmed</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankRef">Bank Reference (optional)</Label>
            <Input
              id="bankRef"
              placeholder="e.g. Transfer confirmation number"
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              If you&apos;ve already made the transfer, enter the reference number here
            </p>
          </div>

          {onProofUpload && (
            <ProofUpload
              onUpload={onProofUpload}
              label="Payment Proof (optional)"
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional information..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Request'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
