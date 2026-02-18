'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconCopy, IconCheck, IconShare, IconUsers } from '@tabler/icons-react'

interface ReferralLinkCardProps {
  code: string
  usedCount: number
  discountMonths: number
  referrerRewardMonths: number
  appUrl: string
}

export function ReferralLinkCard({
  code,
  usedCount,
  discountMonths,
  referrerRewardMonths,
  appUrl,
}: ReferralLinkCardProps) {
  const [copied, setCopied] = useState(false)
  const referralUrl = `${appUrl}/create-school?ref=${code}`

  async function handleCopy() {
    await navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card data-testid="referral-link-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconShare className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle>Referral Program</CardTitle>
        </div>
        <CardDescription>
          Share your referral link to invite other schools. You earn{' '}
          <strong>{referrerRewardMonths} free month{referrerRewardMonths > 1 ? 's' : ''}</strong> for
          every school that signs up and makes their first payment. New schools get{' '}
          <strong>{discountMonths} free month{discountMonths > 1 ? 's' : ''}</strong> when they use
          your link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconUsers className="h-4 w-4" aria-hidden="true" />
          <span>
            <strong className="text-foreground">{usedCount}</strong>{' '}
            school{usedCount !== 1 ? 's' : ''} referred so far
          </span>
        </div>

        {/* Referral URL */}
        <div className="flex gap-2">
          <Input
            readOnly
            value={referralUrl}
            aria-label="Your referral link"
            className="font-mono text-sm"
            data-testid="referral-url-input"
          />
          <Button
            onClick={handleCopy}
            variant="outline"
            size="icon"
            aria-label={copied ? 'Copied!' : 'Copy referral link'}
            data-testid="copy-referral-link-btn"
          >
            {copied ? (
              <IconCheck className="h-4 w-4 text-green-500" aria-hidden="true" />
            ) : (
              <IconCopy className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Referral code: <code className="font-mono font-semibold text-foreground">{code}</code>
        </p>
      </CardContent>
    </Card>
  )
}
