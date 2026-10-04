import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors dashboard/admin/appearance/page.tsx: header with breadcrumb and
 * title; the theme kit picker (panel beside the phone preview on xl, the school
 * page preview below from md); then the logo and favicon card. */
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

      <main className="mx-auto container flex flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          {/* Picker panel */}
          <div className="flex flex-col gap-5 rounded-card p-5 ring-1 ring-foreground/10">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-15 w-full rounded-lg" />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-22 w-full rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
            <Skeleton className="h-10 w-full rounded-button" />
          </div>

          {/* Lesson on a phone */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-[760px] w-full max-w-[390px] rounded-[2rem]" />
          </div>

          {/* School page */}
          <div className="hidden flex-col gap-2 md:flex xl:col-span-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-[640px] w-full rounded-xl" />
          </div>
        </div>

        {/* Logo and favicon */}
        <div className="flex max-w-2xl flex-col gap-4 rounded-card p-5 ring-1 ring-foreground/10">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-full rounded-input" />
          <Skeleton className="h-9 w-full rounded-input" />
        </div>
      </main>
    </div>
  )
}
