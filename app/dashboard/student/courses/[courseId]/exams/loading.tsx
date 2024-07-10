
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function Component () {
    return (
        <div className="flex flex-wrap gap-4 md:gap-6 items-center justify-center">
            <div className="flex flex-col w-full">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-80 rounded-md" />
                        <Skeleton className="h-8 w-60 rounded-md" />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 items-start justify-start w-full">
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
                    </CardContent>
                    <CardFooter>
                        <Skeleton className="h-8 w-32 mx-auto" />
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
