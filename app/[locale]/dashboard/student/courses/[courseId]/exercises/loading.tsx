import { ArrowUpDown, Search, SlidersHorizontal } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export default function ExerciseListSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            <Skeleton className="h-10 w-3/4 max-w-2xl mb-6" />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search exercises" className="pl-8" />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                    >
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Filter
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                    >
                        <ArrowUpDown className="mr-2 h-4 w-4" />
                        Sort by
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(9)].map((_, index) => (
                    <Card key={index} className="flex flex-col">
                        <CardContent className="flex-grow p-6">
                            <Skeleton className="h-6 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-full mb-4" />
                            <div className="flex flex-wrap gap-2 mb-4">
                                <Badge variant="outline">
                                    <Skeleton className="h-3 w-12" />
                                </Badge>
                                <Badge variant="secondary">
                                    <Skeleton className="h-3 w-12" />
                                </Badge>
                                <Badge variant="outline">
                                    <Skeleton className="h-3 w-12" />
                                </Badge>
                            </div>
                        </CardContent>
                        <CardFooter className="p-6 pt-0">
                            <Button className="w-full">
                                <Skeleton className="h-4 w-24" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
