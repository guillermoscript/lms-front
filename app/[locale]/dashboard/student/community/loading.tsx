import { Skeleton } from '@/components/ui/skeleton'

export default function CommunityLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 mt-1" />
        </div>
      </header>

      {/* Feed */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        {/* Compose box */}
        <Skeleton className="h-20 w-full rounded-xl" />

        {/* Posts */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-4 pt-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
