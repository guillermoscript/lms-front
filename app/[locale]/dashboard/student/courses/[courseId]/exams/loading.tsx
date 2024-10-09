import { BookOpen, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function StudentExamsPageSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
                <Skeleton className="h-4 w-full max-w-3xl" />
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <Skeleton className="h-10 w-48 mb-2" />
                    <Skeleton className="h-6 w-64" />
                </div>
                <Card className="w-full md:w-auto">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <Skeleton className="h-4 w-32 mb-1" />
                                <Skeleton className="h-6 w-16" />
                            </div>
                            <BookOpen className="h-8 w-8 text-primary" />
                        </div>
                        <Skeleton className="h-2 w-full mt-2" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, index) => (
                    <Card key={index}>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <Skeleton className="h-6 w-24" />
                                <Clock className="h-5 w-5 text-muted-foreground" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-5 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-full mb-1" />
                            <Skeleton className="h-4 w-5/6 mb-1" />
                            <Skeleton className="h-4 w-4/5 mb-4" />
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full">
                                <Skeleton className="h-4 w-20" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
