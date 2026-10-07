import { Skeleton } from '@/components/ui/skeleton'

/** Form + preview skeleton shared by loading.tsx and the dynamic() fallback. */
export function CertificateSettingsFormSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <div className="space-y-8 lg:col-span-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-3 border-t pt-4">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
      <div className="lg:col-span-2">
        <Skeleton className="aspect-[1.414/1] w-full rounded-lg" />
      </div>
    </div>
  )
}
