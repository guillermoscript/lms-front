import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-3 w-48 mb-4" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56 mt-1" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-5 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </main>
    </div>
  )
}
