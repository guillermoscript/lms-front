import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors assets/page.tsx: header with breadcrumb and title, then the uploader, filters and grid. */
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
      <main className="mx-auto container flex flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full" />
          ))}
        </div>
      </main>
    </div>
  )
}
