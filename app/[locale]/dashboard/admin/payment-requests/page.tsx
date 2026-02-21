import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { PaymentRequestsTable } from '@/components/admin/payment-requests-table'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { IconArrowLeft } from '@tabler/icons-react'

export default async function PaymentRequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.paymentRequests')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = await createClient()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verify admin access
  if (role !== 'admin' && !superAdmin) {
    redirect('/dashboard')
  }

  // Fetch all payment requests with related data, filtered by tenant
  const { data: allRequests } = await supabase
    .from('payment_requests')
    .select(`
      *,
      user:profiles!payment_requests_user_id_fkey(
        id,
        full_name,
        email
      ),
      product:products(
        product_id,
        name,
        price,
        currency
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const requests = allRequests || []

  // Count by status
  const pendingCount = requests.filter(r => r.status === 'pending').length
  const contactedCount = requests.filter(r => r.status === 'contacted').length
  const paymentReceivedCount = requests.filter(r => r.status === 'payment_received').length
  const completedCount = requests.filter(r => r.status === 'completed').length

  // Calculate total revenue from completed requests
  const totalRevenue = requests
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + (Number(r.payment_amount) || 0), 0)

  return (
    <div className="min-h-screen bg-background" data-testid="payment-requests-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('paymentRequests') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">

        {/* Stats Cards */}
        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.pending')}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{pendingCount}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {t('stats.pendingDesc')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.contacted')}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{contactedCount}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {t('stats.contactedDesc')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.received')}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{paymentReceivedCount}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {t('stats.receivedDesc')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.completed')}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{completedCount}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {t('stats.completedTotal', {
                  amount: new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(totalRevenue)
                })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for filtering by status */}
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              {t('tabs.pending', { count: pendingCount })}
            </TabsTrigger>
            <TabsTrigger value="contacted">
              {t('tabs.contacted', { count: contactedCount })}
            </TabsTrigger>
            <TabsTrigger value="payment_received">
              {t('tabs.received', { count: paymentReceivedCount })}
            </TabsTrigger>
            <TabsTrigger value="completed">
              {t('tabs.completed', { count: completedCount })}
            </TabsTrigger>
            <TabsTrigger value="all">
              {t('tabs.all', { count: requests.length })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            <PaymentRequestsTable
              requests={requests.filter(r => r.status === 'pending')}
            />
          </TabsContent>

          <TabsContent value="contacted" className="space-y-4">
            <PaymentRequestsTable
              requests={requests.filter(r => r.status === 'contacted')}
            />
          </TabsContent>

          <TabsContent value="payment_received" className="space-y-4">
            <PaymentRequestsTable
              requests={requests.filter(r => r.status === 'payment_received')}
            />
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            <PaymentRequestsTable
              requests={requests.filter(r => r.status === 'completed')}
            />
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            <PaymentRequestsTable requests={requests} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
