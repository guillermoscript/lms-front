import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/admin/payouts/page.tsx: header w/ breadcrumb + title,
 * two summary cards, payouts table (6 columns). */
export default function Loading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true">
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="mb-4 h-3 w-56" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
      </header>

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        {/* Summary cards */}
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>

        {/* Payouts table */}
        <div className="rounded-xl border">
          <div className="border-b p-5">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
