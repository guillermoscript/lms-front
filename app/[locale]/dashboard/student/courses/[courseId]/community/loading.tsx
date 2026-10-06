import { PageSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

// Mirrors community/page.tsx (course scope): bordered header with back link,
// title, subtitle, then the feed (compose box + posts). Own file, not the school
// feed's, because the course header has an extra back-to-course row.
export default function Loading() {
  return (
    <PageSkeleton label="Loading community" className="p-0 lg:p-0 space-y-0 min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-36 mb-4" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full mt-0.5" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-4 pt-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </main>
    </PageSkeleton>
  )
}
