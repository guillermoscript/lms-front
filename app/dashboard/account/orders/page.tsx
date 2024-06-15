import dayjs from 'dayjs'
import { CheckCircleIcon, ClockIcon, ShoppingCartIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/Table/data-table'
import { createClient } from '@/utils/supabase/server'

import { orderCols } from './columns'

export default async function OrdersPage () {
    const supabase = createClient()

    const orders = await supabase.from('transactions').select('*, products(*)').order('transaction_date', { ascending: false })

    if (orders.error != null) {
        return <div> Error </div>
    }

    if (!orders.data) {
        return <div> No orders </div>
    }

    const orderData = orders.data.map((order) => {
        return {
            ...order,
            id: order.transaction_id,
            product_name: order.products?.name,
            amount: order.amount.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD'
            }),
            transaction_date: dayjs(order.transaction_date).format('DD/MM/YYYY')
        }
    })

    return (
        <>
            <div className="grid md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Total Orders</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                        <div className="text-4xl font-bold">
                            {orderData.length}
                        </div>
                        <ShoppingCartIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Completed Orders</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                        <div className="text-4xl font-bold">
                            {orderData.filter((order) => order.status === 'successful').length}
                        </div>
                        <CheckCircleIcon className="h-8 w-8 text-green-500" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Orders</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                        <div className="text-4xl font-bold">
                            {orderData.filter((order) => order.status === 'pending').length}
                        </div>
                        <ClockIcon className="h-8 w-8 text-yellow-500" />
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable columns={orderCols} data={orderData as any} />
                </CardContent>
            </Card>
        </>
    )
}
