import { PageShell } from "@/components/dashboard/page-shell"
import { Skeleton } from "@/components/ui/skeleton"

// Mirrors exam-taker.tsx: sticky top bar (title + progress, timer), segmented
// question card with answer options, prev/next footer.
export default function Loading() {
  return (
    <PageShell variant="form" skeleton className="flex flex-col">
      <div className="flex-1 flex flex-col gap-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="bg-background border rounded-2xl p-4 flex flex-1 items-center gap-6">
              <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-56 max-w-full" />
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-1.5 w-24 rounded-full" />
                </div>
              </div>
            </div>
            <Skeleton className="h-[74px] w-full md:w-40 rounded-2xl" />
          </div>

          <div className="flex-1 flex flex-col gap-8">
            <div className="rounded-[32px] border overflow-hidden flex-1 flex flex-col">
              <Skeleton className="h-2 w-full rounded-none" />
              <div className="flex-1 p-8 md:p-12 max-w-3xl mx-auto w-full space-y-8">
                <Skeleton className="h-5 w-32" />
                <div className="space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-2/3" />
                </div>
                <div className="grid gap-3 pt-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-14 w-36 rounded-md" />
            <Skeleton className="h-14 w-48 rounded-md" />
          </div>
      </div>
    </PageShell>
  )
}
