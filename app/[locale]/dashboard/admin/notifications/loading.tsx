import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-3 w-48 mb-4" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56 mt-1" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-16 rounded-full ml-auto" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
