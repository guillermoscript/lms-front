import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function TenantsPage() {
  const t = await getTranslations('dashboard.admin.tenants')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const isSuper = await isSuperAdmin()
  if (!isSuper) {
    redirect('/dashboard/admin')
  }

  const supabase = await createClient()
  const { data: tenants } = await supabase
    .from('tenants')
    .select('*, tenant_users(count)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('tenants') },
        ]}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Badge variant="outline">{t('superAdmin')}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tenants?.map((tenant: any) => (
          <Card key={tenant.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg truncate">{tenant.name}</CardTitle>
                <Badge variant={tenant.status === 'active' ? 'default' : 'destructive'}>
                  {tenant.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-sm text-muted-foreground">
                <div className="flex gap-1">
                  <dt>{t('slug')}:</dt>
                  <dd><code className="text-xs">{tenant.slug}</code></dd>
                </div>
                <div className="flex gap-1">
                  <dt>{t('plan')}:</dt>
                  <dd className="capitalize">{tenant.plan}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>{t('members')}:</dt>
                  <dd>{tenant.tenant_users?.[0]?.count || 0}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>{t('created')}:</dt>
                  <dd>{new Date(tenant.created_at).toLocaleDateString()}</dd>
                </div>
                {tenant.stripe_account_id && (
                  <div className="flex gap-1">
                    <dt>Stripe:</dt>
                    <dd>{t('stripeConnected')}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
