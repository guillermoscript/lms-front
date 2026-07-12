'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { toast } from 'sonner'

interface ConnectClaudeCardProps {
  connectorUrl: string
}

export function ConnectClaudeCard({ connectorUrl }: ConnectClaudeCardProps) {
  const t = useTranslations('components.connectClaude')
  const [copied, setCopied] = useState(false)

  const copyConnectorUrl = async () => {
    await navigator.clipboard.writeText(connectorUrl)
    setCopied(true)
    toast.success(t('copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">{t('urlLabel')}</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={connectorUrl} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyConnectorUrl}>
              {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
            </Button>
          </div>
        </div>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
          <li>{t('step4')}</li>
        </ol>
      </CardContent>
    </Card>
  )
}
