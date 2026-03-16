import { Skeleton } from "@/components/ui/skeleton"

export default function CourseDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-12 px-4 md:px-8 max-w-4xl space-y-8">
        {/* Back link */}
        <Skeleton className="h-4 w-24" />

        {/* Thumbnail */}
        <Skeleton className="h-64 w-full rounded-2xl" />

        {/* Title & meta */}
        <div className="space-y-3">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>

        {/* Author */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>

        {/* Lessons list */}
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
