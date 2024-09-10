import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingSupport() {
    return (
        <div className="w-full max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="space-y-4">
                <Skeleton className="h-8 w-full max-w-lg mx-auto" />
                <Skeleton className="h-6 w-full max-w-md mx-auto" />
            </div>
            <Card>
                <CardContent>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                            <div className="sm:col-span-3">
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <div className="sm:col-span-3">
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <div className="sm:col-span-6">
                                <Skeleton className="h-32 w-full" />
                            </div>
                            <div className="sm:col-span-6">
                                <div className="flex items-center space-x-3">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-5 w-full max-w-xs" />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Skeleton className="h-10 w-full sm:w-auto" />
                        </div>
                    </div>
                </CardContent>
            </Card>
            <div className="space-y-4">
                <Skeleton className="h-8 w-full max-w-lg" />
                <Card>
                    <CardContent>
                        <div className="space-y-4">
                            <Skeleton className="h-6 w-full max-w-md" />
                            <Skeleton className="h-6 w-full max-w-md" />
                            <div className="grid grid-cols-3 gap-4">
                                <Skeleton className="h-24 w-full rounded-md" />
                                <Skeleton className="h-24 w-full rounded-md" />
                                <Skeleton className="h-24 w-full rounded-md" />
                            </div>
                            <Skeleton className="h-10 w-full max-w-xs" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
