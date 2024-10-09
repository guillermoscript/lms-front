import { ChevronLeft, Clock, Share2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function ExercisePageSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-6 flex items-center">
                <ChevronLeft className="mr-2 h-4 w-4" />
                <Skeleton className="h-4 w-32" />
            </div>

            <div className="mb-8">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <Skeleton className="h-8 w-64 mb-2" />
                        <Skeleton className="h-4 w-full max-w-md" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full" />
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="outline"><Skeleton className="h-4 w-16" /></Badge>
                    <Badge variant="secondary"><Skeleton className="h-4 w-16" /></Badge>
                    <Badge variant="outline">
                        <Clock className="mr-1 h-3 w-3" />
                        <Skeleton className="h-3 w-12" />
                    </Badge>
                </div>

                <div>
                    <div className="flex justify-between mb-1">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-8" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle><Skeleton className="h-6 w-32" /></CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-5/6 mb-2" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-48 w-full mt-4" />
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle><Skeleton className="h-6 w-24" /></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                {[1, 2, 3].map((_, index) => (
                                    <li key={index} className="flex items-center">
                                        <Skeleton className="h-3 w-3 mr-2 rounded-full" />
                                        <Skeleton className="h-4 flex-grow" />
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle><Skeleton className="h-6 w-24" /></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Button className="w-full" variant="outline">
                                <Share2 className="mr-2 h-4 w-4" />
                                <Skeleton className="h-4 w-32" />
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
