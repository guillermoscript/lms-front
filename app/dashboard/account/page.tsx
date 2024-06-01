import { BarChart, Link } from 'lucide-react'

import { Button } from '@/components/ui/button'
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

    return (
        <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Account Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                            <span className="text-gray-500 dark:text-gray-400">
                                Name:
                            </span>
                            <p>{userProfile.data?.full_name}</p>
                        </div>
                        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                            <span className="text-gray-500 dark:text-gray-400">
                                Email:
                            </span>
                            <p>{user?.email}</p>
                        </div>
                        <div className="grid grid-cols-[100px_1fr] items-center gap-4">
                            <span className="text-gray-500 dark:text-gray-400">
                                Password:
                            </span>
                            <div>
                                <Button size="sm" variant="outline">
                                  Change Password
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button variant="secondary">Edit Profile</Button>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Lesson Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold">75%</p>
                                <p className="text-gray-500 dark:text-gray-400">
                                  Lessons Completed
                                </p>
                            </div>
                            <BarChart className="w-[100px] aspect-square" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Subscription</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold">Pro</p>
                                <p className="text-gray-500 dark:text-gray-400">
                                  Subscription Plan
                                </p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold">$9.99</p>
                                <p className="text-gray-500 dark:text-gray-400">
                                  per month
                                </p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline">Manage Subscription</Button>
                    </CardFooter>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-2xl font-bold">12</p>
                                <p className="text-gray-500 dark:text-gray-400">
                                  Total Orders
                                </p>
                            </div>
                            <Link className="text-blue-600 underline" href="#">
                                View Orders
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
