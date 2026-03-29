import { Skeleton } from "@/components/ui/skeleton"

export default function PricingLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-16 px-4 md:px-8 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12 space-y-3">
          <Skeleton className="h-10 w-64 mx-auto" />
          <Skeleton className="h-5 w-80 mx-auto" />
        </div>

        {/* Pricing cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border p-6 space-y-4">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-10 w-32" />
              <div className="space-y-2 pt-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="h-12 w-full rounded-xl mt-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
