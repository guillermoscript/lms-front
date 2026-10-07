import { Skeleton } from "@/components/ui/skeleton"
import { PageShell, PageHeaderSkeleton } from "@/components/dashboard/page-shell"

const CARD = "flex flex-col gap-4 rounded-card bg-card py-4 ring-1 ring-foreground/10"

function Field({ control = "h-8" }: { control?: string }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className={`${control} w-full rounded-md`} />
    </div>
  )
}

export default function Loading() {
  return (
    <PageShell variant="form" skeleton>
      <PageHeaderSkeleton back />

      <div className="space-y-6">
        <div className="flex justify-end">
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
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
    </PageShell>
  )
}
