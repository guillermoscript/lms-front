import { Skeleton } from "@/components/ui/skeleton";

export default function Index() {
    return (
        <div className="flex flex-wrap justify-center items-center min-h-screen gap-2 min-w-[320px] md:min-w-[820px]">
            <Skeleton className="h-56 w-[320px]" />
            <Skeleton className="h-56 w-[320px]" />
            <Skeleton className="h-56 w-[320px]" />
            <Skeleton className="h-56 w-[320px]" />
            <Skeleton className="h-56 w-[320px]" />
            <Skeleton className="h-56 w-[320px]" />
		</div>
    )
}