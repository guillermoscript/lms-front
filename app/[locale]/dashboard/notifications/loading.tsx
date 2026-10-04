import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/notifications/page.tsx: header title + description, the
 * action bar (filter tabs, Preferences) and the NotificationsClient list. */
export default function Loading() {
  return (
    <div className="container max-w-4xl p-8" aria-busy="true">
      <div className="mb-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-6 w-28" />
      </div>

      <div className="divide-y rounded-lg border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2.5 px-4 py-3">
            <Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
