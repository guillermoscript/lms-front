'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ConnectCliAgents } from '@/components/dashboard/connect-cli-agents'

export interface ConnectSchool {
  tenantId: string
  name: string
  role: string
  connectorUrl: string
}

interface ConnectClaudeCardProps {
  connectorUrl: string
  /** All the user's schools; with 2+ the card lists one connector per school. */
  schools?: ConnectSchool[]
}

export function ConnectClaudeCard({ connectorUrl, schools = [] }: ConnectClaudeCardProps) {
  const t = useTranslations('components.connectClaude')
  const [copied, setCopied] = useState<string | null>(null)
  const multi = schools.length > 1
  const [cliUrl, setCliUrl] = useState(connectorUrl)

  const copyConnectorUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(url)
    toast.success(t('copied'))
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-4">
        {multi ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground block">{t('schoolsTitle')}</Label>
            <p className="text-xs text-muted-foreground">{t('schoolsHint')}</p>
            <ul className="divide-y rounded-lg border">
              {schools.map((s) => (
                <li key={s.tenantId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.has(`roles.${s.role}`) ? t(`roles.${s.role}`) : s.role}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('copySchool', { school: s.name })}
                    onClick={() => copyConnectorUrl(s.connectorUrl)}
                  >
                    {copied === s.connectorUrl ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">{t('urlLabel')}</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={connectorUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copyConnectorUrl(connectorUrl)}>
                {copied === connectorUrl ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
              </Button>
            </div>
          </div>
        )}
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
          <li>{t('step4')}</li>
        </ol>
        {multi && (
          <div className="space-y-1.5 border-t pt-4">
            <Label className="text-xs text-muted-foreground block">{t('cli.schoolLabel')}</Label>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {schools.map((s) => (
                <button
                  key={s.tenantId}
                  type="button"
                  role="radio"
                  aria-checked={cliUrl === s.connectorUrl}
                  onClick={() => setCliUrl(s.connectorUrl)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    cliUrl === s.connectorUrl ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted/50',
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <ConnectCliAgents connectorUrl={cliUrl} />
      </CardContent>
    </Card>
  )
}
