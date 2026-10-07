import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

function SectionCardHeader({ withBadge = false }: { withBadge?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b p-6">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
      {withBadge && <Skeleton className="h-5 w-16 rounded-full" />}
    </div>
  )
}

/** Mirrors profile/page.tsx: header, sticky-width sidebar (profile, stats, subscription), main column cards. */
export default function ProfileLoading() {
  return (
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton />

        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="w-full shrink-0 space-y-6 lg:w-80 xl:w-96">
            <div className="overflow-hidden rounded-xl border">
              <Skeleton className="h-20 w-full rounded-none" />
              <div className="-mt-12 px-6 pb-6 text-center">
                <Skeleton className="mx-auto h-24 w-24 rounded-full border-4 border-background" />
                <Skeleton className="mx-auto mt-3 h-7 w-36" />
                <Skeleton className="mx-auto mt-1 h-5 w-44" />
                <Skeleton className="mx-auto mt-2 h-5 w-16 rounded-full" />
                <div className="mt-6 grid grid-cols-2 gap-4 border-t pt-6">
                  <Skeleton className="mx-auto h-10 w-20" />
                  <Skeleton className="mx-auto h-10 w-20" />
                </div>
              </div>
            </div>

            <div className="space-y-6 rounded-xl border p-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mx-auto h-[140px] w-[140px] rounded-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>

            <div className="space-y-3 rounded-xl border p-6">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-8">
            <div className="rounded-xl border">
              <SectionCardHeader />
              <div className="space-y-6 p-6">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-9 w-32 rounded-md" />
              </div>
            </div>

            <Skeleton className="h-24 w-full rounded-xl" />

            <div className="overflow-hidden rounded-xl border">
              <SectionCardHeader withBadge />
              <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4 rounded-xl border p-4">
                    <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-1.5 w-full rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border">
              <SectionCardHeader withBadge />
              <div className="bg-muted/30 px-6 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-4 gap-4 border-t px-6 py-4">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-5 w-36" />
              </div>
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
          </div>
        </div>
    </PageShell>
  )
}
