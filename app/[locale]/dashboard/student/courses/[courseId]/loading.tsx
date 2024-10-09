import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function CoursePageSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header Skeleton */}
            <div className="relative h-64 mb-8 rounded-lg overflow-hidden">
                <Skeleton className="h-full w-full" />
                <div className="absolute inset-0 flex flex-col justify-end p-6">
                    <Skeleton className="h-10 w-3/4 mb-2" />
                    <Skeleton className="h-6 w-1/2" />
                </div>
            </div>

            {/* Progress Skeleton */}
            <Card className="mb-8">
                <CardHeader>
                    <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between mb-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                            <Skeleton className="h-2 w-full" />
                        </div>
                        <div>
                            <div className="flex justify-between mb-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                            <Skeleton className="h-2 w-full" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs Skeleton */}
            <Tabs defaultValue="lessons" className="w-full mb-8">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="lessons"><Skeleton className="h-4 w-20" /></TabsTrigger>
                    <TabsTrigger value="exercises"><Skeleton className="h-4 w-20" /></TabsTrigger>
                    <TabsTrigger value="exams"><Skeleton className="h-4 w-20" /></TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Lesson Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(8)].map((_, index) => (
                    <Card key={index}>
                        <CardHeader className="p-0">
                            <Skeleton className="h-48 w-full rounded-t-lg" />
                        </CardHeader>
                        <CardContent className="p-4">
                            <Skeleton className="h-6 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-5/6" />
                        </CardContent>
                        <CardFooter className="p-4 pt-0">
                            <Skeleton className="h-10 w-full" />
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
