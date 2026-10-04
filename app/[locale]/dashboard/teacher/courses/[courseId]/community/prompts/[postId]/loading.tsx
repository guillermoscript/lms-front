import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen bg-background" role="status" aria-busy="true" aria-label="Loading">
      <span className="sr-only">Loading...</span>
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl space-y-2 px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
        <div className="divide-y rounded-xl border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
