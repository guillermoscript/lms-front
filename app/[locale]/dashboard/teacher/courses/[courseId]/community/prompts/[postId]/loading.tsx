import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

// Prompt grading: same reading shell + header as page.tsx, prompt card, roster.
export default function Loading() {
  return (
    <PageShell variant="reading" skeleton>
      <PageHeaderSkeleton back />
      <div className="space-y-2 rounded-xl border-l-4 border-primary bg-card p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="divide-y rounded-xl border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </PageShell>
  )
}
