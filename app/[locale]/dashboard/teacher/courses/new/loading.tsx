import { Skeleton } from "@/components/ui/skeleton"
import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"

function Field({ label = "w-24", control = "h-8" }: { label?: string; control?: string }) {
  return (
    <div className="space-y-2">
      <Skeleton className={`h-4 ${label}`} />
      <Skeleton className={`${control} w-full rounded-md`} />
    </div>
  )
}

export default function Loading() {
  return (
    <PageShell variant="form" skeleton>
      <PageHeaderSkeleton back actions={1} />

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
    </PageShell>
  )
}
