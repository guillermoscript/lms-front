import { BookIcon, ClipboardIcon, LayoutGridIcon } from 'lucide-react'
import Link from 'next/link'

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesAdminPage () {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    if (user.error != null) {
        throw new Error(user.error.message)
    }

    const { data: products } = await supabase.from('products').select('*')

    return (
        <>
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href="/dashboard/admin"
                        >
              Admin
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            {/* { products?.length > 0 && (
                <>
                    <h1>Product List</h1>
                    {products.map((product) => (
                        <div key={product.product_id}>
                            <h2>{product.name}</h2>
                            <p>{product.description}</p>
                        </div>
                    ))}
                </>
            )} */}

            <div className="grid grid-cols-1 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Products</CardTitle>
                        <CardDescription>
              View and manage all your products.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            <Link
                                className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                                href="/dashboard/admin/courses"
                            >
                                <LayoutGridIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium">Courses</span>
                            </Link>

                            <div className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 opacity-50 cursor-not-allowed">
                                <BookIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium">Lessons</span>
                            </div>

                            <div className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 opacity-50 cursor-not-allowed">
                                <ClipboardIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium">Tests</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
