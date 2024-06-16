import { Skeleton } from '@/components/ui/skeleton'

export default function SkeletonDemo () {
    return (
        <div className="flex w-full min-h-screen p-2 space-x-4">
            <Skeleton className="h-72 w-full" />
        </div>
    )
}
