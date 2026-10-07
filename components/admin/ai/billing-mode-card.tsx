'use client'

import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

/**
 * Who pays for AI. Only "your own keys" exists today; managed billing is a
 * visible, disabled placeholder so the choice is not a surprise later.
 */
export function BillingModeCard({ mode }: { mode: 'byok' | 'managed' }) {
  const t = useTranslations('aiSettings.billing')

  return (
    <Card data-testid="ai-billing-mode">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={mode === 'managed' ? 'managed' : 'byok'} aria-label={t('title')}>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value="byok" id="ai-mode-byok" className="mt-0.5" />
            <div className="space-y-0.5">
              <Label htmlFor="ai-mode-byok">{t('byok.label')}</Label>
              <p className="text-xs text-muted-foreground">{t('byok.description')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-3 opacity-70">
            <RadioGroupItem value="managed" id="ai-mode-managed" disabled className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="ai-mode-managed">{t('managed.label')}</Label>
                <Badge variant="secondary">{t('managed.badge')}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{t('managed.description')}</p>
            </div>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
