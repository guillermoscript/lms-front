'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { setAiTraceContent } from '@/app/actions/admin/ai-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import { asTranslator, failureText } from './helpers'

/** Opt out of prompt/completion text in the platform's AI observability traces. */
export function TraceContentCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations('aiSettings')
  const tx = asTranslator(t)
  const [value, setValue] = useState(enabled)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    const previous = value
    setValue(next)
    startTransition(async () => {
      try {
        const res = await setAiTraceContent(next)
        if (res.ok) {
          toast.success(t('trace.saved'))
        } else {
          setValue(previous)
          toast.error(failureText(tx, res))
        }
      } catch {
        setValue(previous)
        toast.error(t('errors.save_failed'))
      }
    })
  }

  return (
    <Card data-testid="ai-trace-content">
      <CardHeader>
        <CardTitle>{t('trace.title')}</CardTitle>
        <CardDescription>{t('trace.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="ai-trace-content-switch">{t('trace.label')}</Label>
            <p className="text-xs text-muted-foreground">{t('trace.hint')}</p>
          </div>
          <Switch
            id="ai-trace-content-switch"
            checked={value}
            onCheckedChange={change}
            disabled={pending}
            aria-label={t('trace.label')}
          />
        </div>
      </CardContent>
    </Card>
  )
}
