import { Skeleton } from "@/components/ui/skeleton"
import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card py-4 space-y-4">{children}</div>
}

export default function Loading() {
  return (
    <PageShell variant="reading" skeleton>
      <PageHeaderSkeleton />

      {/* Connect card */}
      <CardShell>
        <div className="px-4 space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="px-4 space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 flex-1 rounded-md" />
              <Skeleton className="size-9 rounded-md shrink-0" />
            </div>
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full max-w-lg" />
            ))}
          </div>
        </div>
      </CardShell>

      {/* What you can do */}
      <CardShell>
        <div className="px-4 space-y-1.5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="px-4 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="size-4 mt-0.5 rounded-full shrink-0" />
              <Skeleton className="h-5 w-full max-w-xl" />
            </div>
          ))}
        </div>
      </CardShell>
    </PageShell>
  )
}
