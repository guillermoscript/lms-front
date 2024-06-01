import { Skeleton } from '@/components/ui/skeleton'

function LoadingCard () {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-[125px] w-[250px] rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  )
}

export default function Index () {
  return (
    <div className="flex min-h-screen p-4 flex-wrap container gap-1 items-center justify-around">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <LoadingCard key={item} />)}
    </div>
  )
}
