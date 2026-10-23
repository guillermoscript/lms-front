import { Skeleton } from "@/components/ui/skeleton"

/** Mirrors the admin home: header, attention line, performance, activity + rail, plan strip. */
export default function Loading() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      <Skeleton className="h-5 w-72" />

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-8">
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-3 lg:col-span-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-44 w-full rounded-lg" />
            </div>
            <div className="divide-y rounded-lg border lg:col-span-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-10" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="divide-y rounded-lg border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-3">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>

      <Skeleton className="h-10 w-full" />
    </div>
  )
}
