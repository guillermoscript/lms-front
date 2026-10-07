import { Skeleton } from "@/components/ui/skeleton"
import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"

export default function Loading() {
  return (
    <PageShell variant="default" skeleton>
      <PageHeaderSkeleton actions={1} />

      <div className="flex flex-col gap-4 rounded-card bg-card py-4 ring-1 ring-foreground/10">
        <div className="space-y-1.5 px-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-56 max-w-full" />
          <Skeleton className="mt-3 h-8 w-full max-w-sm rounded-md" />
        </div>
        <div className="px-4">
          <div className="flex items-center gap-4 border-b py-3">
            <Skeleton className="h-3 w-32 flex-1" />
            <Skeleton className="h-3 w-[88px]" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-[80px]" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b py-3 last:border-0">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44 max-w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-5 w-[88px] rounded-full" />
              <div className="flex w-24 gap-1">
                <Skeleton className="h-4 w-10 rounded-sm" />
                <Skeleton className="h-4 w-10 rounded-sm" />
              </div>
              <Skeleton className="h-3 w-20" />
              <div className="w-[80px]">
                <Skeleton className="h-6 w-6 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
