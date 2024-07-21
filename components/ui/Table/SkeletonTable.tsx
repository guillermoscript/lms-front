import { Skeleton } from '@/components/ui/skeleton'

const TableLoader = (props) => (
    <div className="w-full p-4 space-y-4" {...props}>
        <div className="flex justify-between gap-2 items-center w-full py-2 border-b">
            <Skeleton className="w-[5%] h-6" />  {/* ID Column Skeleton */}
            <Skeleton className="w-[20%] h-6" /> {/* Title Column Skeleton */}
            <Skeleton className="w-[50%] h-6" /> {/* Description Column Skeleton */}
            <Skeleton className="w-[10%] h-6" /> {/* Sequence Column Skeleton */}
            <Skeleton className="w-[10%] h-6" /> {/* Date Column Skeleton */}
            <Skeleton className="w-[5%] h-6" />  {/* Actions Column Skeleton */}
        </div>
        {[...Array(8)].map((_, index) => (
            <div
                key={index}
                className="flex justify-between gap-2 items-center w-full py-2 border-b"
            >
                <Skeleton className="w-[5%] h-6" />  {/* ID Skeleton */}
                <Skeleton className="w-[20%] h-6" /> {/* Title Skeleton */}
                <Skeleton className="w-[50%] h-6" /> {/* Description Skeleton */}
                <Skeleton className="w-[10%] h-6" /> {/* Sequence Skeleton */}
                <Skeleton className="w-[10%] h-6" /> {/* Date Skeleton */}
                <Skeleton className="w-[5%] h-6" />  {/* Actions Skeleton */}
            </div>
        ))}
    </div>
)

export default TableLoader
