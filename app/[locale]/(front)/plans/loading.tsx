
import { Skeleton } from '@/components/ui/skeleton'

export default function Component () {
    return (
        <div className="flex gap-3 flex-wrap p-6">
            <div className="flex flex-col space-y-3">
                <Skeleton className="h-[225px] w-[250px] rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-16 w-[250px]" />
                    <Skeleton className="h-16 w-[200px]" />
                </div>
            </div>
            <div className="flex flex-col space-y-3">
                <Skeleton className="h-[225px] w-[250px] rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-16 w-[250px]" />
                    <Skeleton className="h-16 w-[200px]" />
                </div>
            </div>
            <div className="flex flex-col space-y-3">
                <Skeleton className="h-[225px] w-[250px] rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-16 w-[250px]" />
                    <Skeleton className="h-16 w-[200px]" />
                </div>
            </div>
        </div>
    )
}
