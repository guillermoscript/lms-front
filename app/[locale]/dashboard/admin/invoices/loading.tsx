import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/admin/invoices/page.tsx: header w/ breadcrumb + title,
 * contextual note strip, invoices table (6 columns, no stat cards). */
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
        {/* Contextual note */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        {/* Invoices table */}
        <div className="rounded-xl border">
          <div className="flex items-center justify-between border-b bg-muted/15 p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-8" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="hidden h-4 w-24 md:block" />
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
