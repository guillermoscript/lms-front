import { Skeleton } from "@/components/ui/skeleton"

export default function CoursesLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto py-16 px-4 md:px-8">
        {/* Header */}
        <div className="mb-12 space-y-4 max-w-2xl">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-6 w-96" />
        </div>

        {/* Search bar placeholder */}
        <Skeleton className="h-12 w-full max-w-md mb-4" />

        {/* Results count */}
        <Skeleton className="h-4 w-32 mb-8" />

        {/* Course grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="flex items-center gap-2 pt-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
