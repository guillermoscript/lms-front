import { Loader2 } from 'lucide-react'

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function StudentDashboardSkeleton() {
    return (
        <div className="container mx-auto p-4 space-y-8">
            {/* Welcome message skeleton */}
            <div className="space-y-2">
                <Skeleton className="h-8 w-3/4 max-w-lg" />
                <Skeleton className="h-4 w-1/2 max-w-md" />
            </div>

            {/* Stats cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="flex flex-col justify-between">
                        <CardHeader>
                            <Skeleton className="h-4 w-1/2" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-16" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Course Progress section skeleton */}
            <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <Card key={i}>
                            <CardContent className="p-0">
                                <Skeleton className="h-40 w-full" />
                                <div className="p-4 space-y-2">
                                    <Skeleton className="h-5 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                    <Skeleton className="h-2 w-full" />
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Skeleton className="h-9 w-full" />
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Recent Activity section skeleton */}
            <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                {[...Array(3)].map((_, i) => (
                    <Card key={i} className="flex flex-col md:flex-row">
                        <Skeleton className="h-48 md:h-auto md:w-64 rounded-t-lg md:rounded-l-lg md:rounded-tr-none" />
                        <div className="flex-1 p-4 space-y-2">
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <div className="flex items-center space-x-2">
                                <Skeleton className="h-4 w-4 rounded-full" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                            <Skeleton className="h-9 w-40" />
                        </div>
                    </Card>
                ))}
            </div>

            {/* Loading indicator */}
            <div className="flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        </div>
    )
}
