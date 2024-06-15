
import Link from 'next/link'

import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'

export default async function Dashboard () {
    const supabase = createClient()
    const {
        data: { user },
        error
    } = await supabase.auth.getUser()

    if (error != null) {
        throw new Error(error.message)
    }

    const userProfile = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()

    const userSubscriptions = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', user?.id)
        .single()

    const userTransactions = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user?.id)

    return (
        <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Account Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                            <span className="text-gray-500 dark:text-gray-400">Name:</span>
                            <p>{userProfile.data?.full_name}</p>
                        </div>
                        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                            <span className="text-gray-500 dark:text-gray-400">Email:</span>
                            <p>{user?.email}</p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Link
                            href="/dashboard/account/profile"
                            className="text-blue-600 underline"
                        >
                Edit Profile
                        </Link>
                    </CardFooter>
                </Card>
                {userSubscriptions.data != null && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Subscriptions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4 justify-between">
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400">
                        Subscription ID
                                    </p>
                                    <p className="text-2xl font-bold">
                                        {userSubscriptions.data.subscription_id}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400">
                                        {userSubscriptions.data.plans?.plan_name}
                                    </p>
                                    <p className="text-2xl font-bold">
                                        {userSubscriptions.data.plans?.price.toLocaleString(
                                            'en-US',
                                            {
                                                style: 'currency',
                                                currency: 'USD'
                                            }
                                        )}
                                    </p>
                                </div>
                                <Link
                                    className="text-blue-600 underline"
                                    href="/dashboard/account/subscriptions"
                                >
                    View Subscriptions
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                )}
                <Card>
                    <CardHeader>
                        <CardTitle>Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold">
                                    {userTransactions.data.length}
                                </p>
                                <p className="text-gray-500 dark:text-gray-400">
                    Total Orders
                                </p>
                            </div>
                            <Link
                                className="text-blue-600 underline"
                                href="/dashboard/account/orders"
                            >
                  View Orders
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
