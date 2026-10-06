import { Skeleton } from "@/components/ui/skeleton"

function Field({ label = "w-24", control = "h-8" }: { label?: string; control?: string }) {
  return (
    <div className="space-y-2">
      <Skeleton className={`h-4 ${label}`} />
      <Skeleton className={`${control} w-full rounded-md`} />
    </div>
  )
}

/** Page uses `container mx-auto px-4 py-8 sm:px-6 lg:px-8`, not the dashboard padding. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto container px-4 py-8 sm:px-6 lg:px-8 animate-in fade-in duration-300 motion-reduce:animate-none"
    >
      <span className="sr-only">Loading new course form…</span>
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />
      </div>

      <div className="flex flex-col gap-4 rounded-card bg-card py-4 ring-1 ring-foreground/10">
        <div className="px-4">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-6 px-4">
          <Field label="w-16" />
          <Field label="w-24" control="h-16" />
          <Field label="w-32" control="h-16" />
          <Field label="w-40" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
          <Field label="w-20" />
          <Field label="w-16" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-8 flex-1 rounded-md" />
            <Skeleton className="h-8 flex-1 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
