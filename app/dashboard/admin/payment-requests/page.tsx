import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { PaymentRequestsTable } from '@/components/admin/payment-requests-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function PaymentRequestsPage() {

  const supabase = await createClient()

  // Fetch all payment requests with related data
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment Requests</h1>
        <p className="text-muted-foreground mt-1">
          Manage manual payment requests from students
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Awaiting your response
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contacted</CardDescription>
            <CardTitle className="text-3xl">{contactedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Payment instructions sent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Payment Received</CardDescription>
            <CardTitle className="text-3xl">{paymentReceivedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Ready to enroll
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl">{completedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              ${totalRevenue.toFixed(2)} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for filtering by status */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="contacted">
            Contacted ({contactedCount})
          </TabsTrigger>
          <TabsTrigger value="payment_received">
            Payment Received ({paymentReceivedCount})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedCount})
          </TabsTrigger>
          <TabsTrigger value="all">
            All ({requests.length})
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
    </div>
  )
}
