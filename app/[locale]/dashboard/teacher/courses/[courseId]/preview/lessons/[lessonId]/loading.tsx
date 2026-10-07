import { PageSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors the lesson preview: banner, lesson header, content, nav footer, sidebar.
export default function Loading() {
  return (
    <PageSkeleton label="Loading lesson" className="flex h-[calc(100svh-4rem)] flex-col space-y-0 overflow-hidden bg-background p-0 lg:p-0">
      <div className="sticky top-0 z-50 shrink-0 border-b bg-background bg-linear-to-r from-warning/10 to-warning/10 px-4 py-2">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-7 w-28 rounded-md" />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b bg-card/80 px-4 py-3 md:px-6">
            <div className="mx-auto max-w-4xl space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-72 max-w-full" />
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 md:px-6 md:py-10">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
          <div className="shrink-0 border-t bg-card/80 px-4 py-3 md:px-6">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
        </div>
        <aside className="hidden h-full w-72 shrink-0 flex-col border-l bg-card/50 md:flex">
          <div className="space-y-3 border-b p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-4/5" />
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </div>
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </aside>
      </div>
    </PageSkeleton>
  )
}
