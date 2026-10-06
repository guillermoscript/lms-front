import { Skeleton } from "@/components/ui/skeleton"
import { PageSkeleton } from "@/components/skeletons"

// Mirrors LessonEditorShell: h-14 header (breadcrumb, step nav, actions) + max-w-3xl form body.
export default function Loading() {
  return (
    <PageSkeleton
      label="Loading lesson editor"
      className="flex h-[calc(100vh-4rem)] flex-col space-y-0 p-0 lg:p-0"
    >
      <div className="flex h-14 flex-none items-center justify-between gap-4 border-b px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          <Skeleton className="h-4 w-32 lg:w-48" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="hidden h-9 w-72 rounded-lg md:block" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </PageSkeleton>
  )
}
