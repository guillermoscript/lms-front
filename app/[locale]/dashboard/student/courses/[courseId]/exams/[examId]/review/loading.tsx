import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"
import { Skeleton } from "@/components/ui/skeleton"

// Mirrors review/page.tsx: header with back, 3-stat score card, question review cards.
export default function Loading() {
  return (
    <PageShell variant="reading" skeleton>
      <PageHeaderSkeleton back />

      <div className="rounded-xl border py-8 px-6">
        <div className="flex items-center justify-center gap-4 sm:gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="contents">
              {i > 0 && <div className="h-16 w-px bg-border" />}
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-7 w-44" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-20 rounded-full shrink-0" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
