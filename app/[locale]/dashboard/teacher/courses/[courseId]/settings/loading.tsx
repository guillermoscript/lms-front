import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

function FieldSkeleton({ area = false }: { area?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className={area ? 'h-24 w-full rounded-md' : 'h-9 w-full rounded-md'} />
    </div>
  )
}

// Mirrors course settings: breadcrumb, title, form, toggles, danger zone.
export default function Loading() {
  return (
    <PageSkeleton label="Loading settings" className="min-h-screen space-y-0 bg-background p-0 lg:p-0">
      <div className="mx-auto container px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-5 w-56" />
        </div>
        <div className="mb-6 space-y-1.5">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="space-y-6">
          <FieldSkeleton />
          <FieldSkeleton area />
          <div className="grid gap-6 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <Skeleton className="my-8 h-px w-full" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="my-8 h-px w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="my-8 h-px w-full" />
        <div className="space-y-2 rounded-lg border border-destructive/30 p-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="mt-2 h-9 w-36 rounded-md" />
        </div>
      </div>
    </PageSkeleton>
  )
}
