import { Skeleton } from "@/components/ui/skeleton"

const CARD = "flex flex-col gap-4 rounded-card bg-card py-4 ring-1 ring-foreground/10"

function Field({ control = "h-8" }: { control?: string }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className={`${control} w-full rounded-md`} />
    </div>
  )
}

/** Page shell is `flex-1 space-y-8 p-8 pt-6`; header is back button + h2 (text-3xl). */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex-1 space-y-8 p-8 pt-6 animate-in fade-in duration-300 motion-reduce:animate-none"
    >
      <span className="sr-only">Loading template form…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
        <div>
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-1.5 h-5 w-80 max-w-full" />
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <div className={CARD}>
              <div className="space-y-1.5 px-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              <div className="space-y-4 px-4">
                <Field />
                <Field />
                <Field control="h-16" />
              </div>
            </div>
            <div className={CARD}>
              <div className="space-y-1.5 px-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <div className="space-y-4 px-4">
                <div className="flex gap-2">
                  <Skeleton className="h-8 flex-1 rounded-md" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <Skeleton className="h-8 w-full rounded-md" />
          </div>

          <div className="space-y-6">
            <Skeleton className="h-8 w-full rounded-lg" />
            <div className={CARD}>
              <div className="space-y-1.5 px-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <div className="space-y-4 px-4">
                <Skeleton className="h-48 w-full rounded-md" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
