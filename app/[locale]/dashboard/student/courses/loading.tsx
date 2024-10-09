import { ChevronRight, LayoutGrid, List, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function CourseDashboardSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
                <Skeleton className="h-4 w-48" />
            </div>

            <Skeleton className="h-10 w-48 mb-6" />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar Cursos" className="pl-8" />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon">
                        <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                        <List className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="in-progress" className="w-full mb-6">
                <TabsList>
                    <TabsTrigger value="in-progress">
                        <Skeleton className="h-4 w-24" />
                    </TabsTrigger>
                    <TabsTrigger value="completed">
                        <Skeleton className="h-4 w-24" />
                    </TabsTrigger>
                    <TabsTrigger value="all-courses">
                        <Skeleton className="h-4 w-24" />
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, index) => (
                    <Card key={index}>
                        <CardContent className="p-0">
                            <Skeleton className="h-48 w-full" />
                            <div className="p-4">
                                <Skeleton className="h-6 w-3/4 mb-2" />
                                <Skeleton className="h-4 w-full mb-4" />
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 w-10" />
                                    </div>
                                    <Skeleton className="h-2 w-full" />
                                    <div className="flex justify-between items-center">
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 w-10" />
                                    </div>
                                    <Skeleton className="h-2 w-full" />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="p-4">
                            <Button className="w-full">
                                <Skeleton className="h-4 w-32 mr-2" />
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    )
}
