import { Skeleton } from '@/components/ui/skeleton'
import { PageShell } from '@/components/dashboard/page-shell'

/** Mirrors access-suspended/page.tsx: reading shell, centered icon + title + card + button. */
export default function AccessSuspendedLoading() {
  return (
    <PageShell variant="reading" skeleton>
      <div className="flex flex-col items-center gap-8 py-10 text-center">
        <Skeleton className="size-16 rounded-full" />
        <div className="w-full space-y-3">
          <Skeleton className="mx-auto h-8 w-64 max-w-full" />
          <Skeleton className="mx-auto h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>
    </PageShell>
  )
}
