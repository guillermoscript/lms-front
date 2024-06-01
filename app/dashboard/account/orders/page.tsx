import { Sidebar } from '@/components/dashboard/Sidebar'
import { DataTable } from '@/components/ui/Table/data-table'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { orderCols } from './columns'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ShoppingCartIcon, CheckCircleIcon, ClockIcon } from 'lucide-react'

export default async function OrdersPage () {
  return (
    <>
      <OrderTable />
    </>
  )
}

async function OrderTable () {
  const cookieStore = cookies()
  const supabase = createClient()

  const orders = await supabase.from('invoices').select(` 
        id,
        status,
        created_at,
        paid_at,
        due_date,
        currencies ( code )
    `)

  console.log(orders.data)

  if (orders.error != null) {
    return <div> Error </div>
  }

  if (!orders.data) {
    return <div> No orders </div>
  }

  return (

    <>
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-4xl font-bold">1,234</div>
            <ShoppingCartIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-4xl font-bold">987</div>
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-4xl font-bold">247</div>
            <ClockIcon className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>

          <DataTable
            columns={orderCols}
            data={orders.data}
          />
        </CardContent>
      </Card>
    </>
  )
}
