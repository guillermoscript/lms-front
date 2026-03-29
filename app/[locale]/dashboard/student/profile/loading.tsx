import { Skeleton } from '@/components/ui/skeleton'

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="container mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Page Header */}
        <div className="mb-8">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64 mt-1" />
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-6">
            {/* Profile Card */}
            <div className="rounded-lg border overflow-hidden">
              <Skeleton className="h-20 w-full" />
              <div className="px-6 pb-6 pt-0 -mt-12 text-center">
                <Skeleton className="h-24 w-24 rounded-full mx-auto border-4 border-background" />
                <Skeleton className="h-6 w-36 mx-auto mt-3" />
                <Skeleton className="h-4 w-44 mx-auto mt-1" />
                <Skeleton className="h-5 w-16 mx-auto mt-2 rounded-full" />
                <div className="mt-6 pt-6 border-t grid grid-cols-2 gap-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            </div>

            {/* Gamification Stats Card */}
            <div className="rounded-lg border p-6 space-y-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-36 w-36 rounded-full mx-auto" />
              <Skeleton className="h-20 w-full" />
            </div>

            {/* Subscription Card */}
            <div className="rounded-lg border p-6 space-y-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full mt-2" />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-8">
            {/* Account Settings */}
            <div className="rounded-lg border">
              <div className="p-6 border-b">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-4 w-48 mt-1" />
              </div>
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-32" />
              </div>
            </div>

            {/* Purchased Courses */}
            <div className="rounded-lg border">
              <div className="p-6 border-b">
                <Skeleton className="h-6 w-28" />
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-4 rounded-xl border">
                    <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-1.5 w-full rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Billing History */}
            <div className="rounded-lg border">
              <div className="p-6 border-b">
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-4 gap-4 py-3 border-b last:border-0">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
