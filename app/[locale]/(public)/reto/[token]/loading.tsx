import { Skeleton } from '@/components/ui/skeleton'

export default function ChallengeLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 md:py-14" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
