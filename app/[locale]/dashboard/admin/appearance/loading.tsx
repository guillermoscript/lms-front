import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/admin/appearance/page.tsx: header w/ breadcrumb + title,
 * two-column grid — theme preview left, theme + branding cards right. */
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
        <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
          {/* Preview */}
          <div className="order-2 lg:order-1">
            <Skeleton className="h-[480px] w-full rounded-xl" />
          </div>

          {/* Theme controls + Branding */}
          <div className="order-1 space-y-6 lg:order-2">
            <div className="rounded-xl border p-5 space-y-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-5 space-y-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
