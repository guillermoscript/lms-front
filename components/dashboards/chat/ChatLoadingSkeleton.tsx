import { Skeleton } from '@/components/ui/skeleton'

export default function ChatLoadingSkeleton() {
    return (
        <div className="space-y-2 w-full">
            <Skeleton className="h-3 md:h-6 rounded mr-14" />
            <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-3 md:h-6 rounded col-span-2" />
                <Skeleton className="h-3 md:h-6 rounded col-span-1" />
            </div>
            <div className="grid grid-cols-4 gap-4">
                <Skeleton className="h-3 md:h-6 rounded col-span-1" />
                <Skeleton className="h-3 md:h-6 rounded col-span-2" />
                <Skeleton className="h-3 md:h-6 rounded col-span-1 mr-4" />
            </div>
            <Skeleton className="h-3 md:h-6 rounded" />
        </div>
    )
}
