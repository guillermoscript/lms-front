import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { PaymentRequestsTable } from '@/components/admin/payment-requests-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'

export default async function PaymentRequestsPage({
  params: { locale }
}: {
  params: { locale: string }
}) {
  const t = await getTranslations('dashboard.admin.paymentRequests')
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              {t('back')}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('stats.pending')}</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t('stats.pendingDesc')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('stats.contacted')}</CardDescription>
            <CardTitle className="text-3xl">{contactedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t('stats.contactedDesc')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('stats.received')}</CardDescription>
            <CardTitle className="text-3xl">{paymentReceivedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t('stats.receivedDesc')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('stats.completed')}</CardDescription>
            <CardTitle className="text-3xl">{completedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
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
