import { getTranslations } from 'next-intl/server'
import { getCurrentTenant, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserSchools } from '@/lib/mcp/user-schools'
import { ConnectClaudeCard } from '@/components/dashboard/connect-claude-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { IconCircleCheck } from '@tabler/icons-react'

export default async function StudentAiAssistantPage() {
  const t = await getTranslations('dashboard.student.aiAssistant')
  const tenant = await getCurrentTenant()
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const connectorUrl = tenant?.slug
    ? `https://${tenant.slug}.${platformDomain}/api/mcp`
    : `https://${platformDomain}/api/mcp`

  const userId = await getCurrentUserId()
  const schools = userId ? await getUserSchools(userId) : []

  return (
    <PageShell variant="reading">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <ConnectClaudeCard connectorUrl={connectorUrl} schools={schools} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('whatYouCanDo.title')}</CardTitle>
          <CardDescription>{t('whatYouCanDo.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {(['item1', 'item2', 'item3', 'item4', 'item5'] as const).map((key) => (
              <li key={key} className="flex items-start gap-2">
                <IconCircleCheck className="size-4 mt-0.5 shrink-0 text-brand-text" />
                <span>{t(`whatYouCanDo.${key}`)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  )
}
