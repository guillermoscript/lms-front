import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function Component() {
    return (
        <div className="flex flex-wrap gap-4 md:gap-6 items-center justify-center">
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40 rounded-md" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4 items-start justify-start min-w-[calc(30vw-2rem)]">
                    <ChatLoadingSkeleton />
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-8 w-32 mx-auto" />
                </CardFooter>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40 rounded-md" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4 items-start justify-start min-w-[calc(30vw-2rem)]">
                    <ChatLoadingSkeleton />
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-8 w-32 mx-auto" />
                </CardFooter>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40 rounded-md" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4 items-start justify-start min-w-[calc(30vw-2rem)]">
                    <ChatLoadingSkeleton />
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-8 w-32 mx-auto" />
                </CardFooter>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40 rounded-md" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4 items-start justify-start min-w-[calc(30vw-2rem)]">
                    <ChatLoadingSkeleton />
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-8 w-32 mx-auto" />
                </CardFooter>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-40 rounded-md" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4 items-start justify-start min-w-[calc(30vw-2rem)]">
                    <ChatLoadingSkeleton />
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-8 w-32 mx-auto" />
                </CardFooter>
            </Card>
        </div>
    )
}
