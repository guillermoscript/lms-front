'use client'

import { useTranslations } from 'next-intl'
import { ConnectClaudeCard, type ConnectSchool } from '@/components/dashboard/connect-claude-card'

interface ApiTokensPageProps {
  mcpUrl: string
  schools?: ConnectSchool[]
}

/** "Connect AI" page: sign-in setup for Claude and CLI agents (no API tokens). */
export default function ApiTokensPage({ mcpUrl, schools }: ApiTokensPageProps) {
  const t = useTranslations('dashboard.admin.apiTokens')

  // OAuth custom-connector URL: the same endpoint without the legacy /cli path.
  const connectorUrl = mcpUrl.replace(/\/cli$/, '')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('description')}</p>
      </div>
      <ConnectClaudeCard connectorUrl={connectorUrl} schools={schools} />
    </div>
  )
}
