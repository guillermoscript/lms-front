
import { Skeleton } from '@/components/ui/skeleton'

export default function Component () {
  return (
    <div className="w-full px-4 md:px-6 py-12 md:py-20">
      <div className="grid md:grid-cols-2 gap-10 md:gap-16 w-full">
        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-full max-w-lg" />
            <Skeleton className="h-5 w-full max-w-lg" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="space-y-4">
            <div>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div>
              <Skeleton className="h-5 w-24" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="grid gap-6">
          <Skeleton className="h-[400px] w-full rounded-lg" />
          <div className="grid md:grid-cols-2 gap-6 w-full">
            <Skeleton className="h-[200px] w-full rounded-lg" />
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
