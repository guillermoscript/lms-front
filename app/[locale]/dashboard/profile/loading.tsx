import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/settings/page.tsx: header, account card (profile form),
 * preferences card (tours toggle), Connect Claude card, manage-tokens button. */
export default function Loading() {
  return (
    <div className="p-6 lg:p-8" aria-busy="true">
      <div className="max-w-3xl space-y-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-0.5 h-4 w-56" />
        </div>

        {/* Account */}
        <div className="rounded-xl border p-5 space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>

        {/* Preferences */}
        <div className="rounded-xl border p-5 space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>

        {/* Connect Claude card */}
        <div className="rounded-xl border p-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>

        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
    </div>
  )
}
