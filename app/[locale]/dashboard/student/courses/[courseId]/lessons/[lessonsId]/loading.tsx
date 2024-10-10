import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function LessonPageSkeleton() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
                <Skeleton className="h-4 w-full max-w-3xl" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <div className="flex items-center gap-4 mb-6">
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <div>
                            <Skeleton className="h-8 w-64 mb-2" />
                            <Skeleton className="h-4 w-full max-w-md" />
                        </div>
                    </div>

                    <Card className="mb-8">
                        <CardHeader>
                            <CardTitle><Skeleton className="h-6 w-48" /></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-5/6 mb-2" />
                            <Skeleton className="h-4 w-4/5" />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle><Skeleton className="h-6 w-64" /></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {[...Array(5)].map((_, index) => (
                                            <TableHead key={index}><Skeleton className="h-4 w-20" /></TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[...Array(10)].map((_, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {[...Array(5)].map((_, cellIndex) => (
                                                <TableCell key={cellIndex}><Skeleton className="h-4 w-16" /></TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div>
                    <Card>
                        <CardHeader>
                            <Tabs defaultValue="comments">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="comments"><Skeleton className="h-4 w-20" /></TabsTrigger>
                                    <TabsTrigger value="timeline"><Skeleton className="h-4 w-20" /></TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="comments">

                                <TabsContent value="comments">
                                    <div className="space-y-4">
                                        {[...Array(3)].map((_, index) => (
                                            <div key={index} className="flex gap-2">
                                                <Skeleton className="h-10 w-10 rounded-full" />
                                                <div className="flex-1">
                                                    <Skeleton className="h-4 w-32 mb-2" />
                                                    <Skeleton className="h-3 w-full" />
                                                    <Skeleton className="h-3 w-5/6" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>
                                <TabsContent value="timeline">
                                    <Skeleton className="h-40 w-full" />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

export function LessonBodyLoading() {
    return (
        <div className='flex flex-col gap-4 mt-4'>
            <div className="flex items-start gap-3 w-full">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 w-full">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[calc(100%-3rem)]" />
                    <Skeleton className="h-4 w-[calc(100%-2rem)]" />
                </div>
            </div>
            <div className="flex items-start gap-3 w-full">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 w-full">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[calc(100%-3rem)]" />
                    <Skeleton className="h-4 w-[calc(100%-2rem)]" />
                </div>
            </div>
            <div className="flex items-start gap-3 w-full">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 w-full">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[calc(100%-3rem)]" />
                    <Skeleton className="h-4 w-[calc(100%-2rem)]" />
                </div>
            </div>
            <div className="flex items-start gap-3 w-full">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 w-full">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[calc(100%-3rem)]" />
                    <Skeleton className="h-4 w-[calc(100%-2rem)]" />
                </div>
            </div>
            <div className="flex items-start gap-3 w-full">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 w-full">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[calc(100%-3rem)]" />
                    <Skeleton className="h-4 w-[calc(100%-2rem)]" />
                </div>
            </div>
            <div className="flex items-start gap-3 w-full">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 w-full">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-[calc(100%-3rem)]" />
                    <Skeleton className="h-4 w-[calc(100%-2rem)]" />
                </div>
            </div>

        </div>
    )
}
