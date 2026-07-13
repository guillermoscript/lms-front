import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <main className="flex flex-1 flex-col overflow-hidden w-full">
        {/* Course progress line placeholder */}
        <div className="shrink-0 h-1 bg-muted" />

        {/* Header */}
        <header className="shrink-0 border-b bg-card/80 px-3 py-2.5 sm:px-4 sm:py-3 md:px-6">
          <div className="max-w-4xl mx-auto space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-64" />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="mx-auto max-w-4xl px-3 py-5 sm:px-4 sm:py-8 md:px-6 md:py-10 space-y-6">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>

        {/* Navigation footer */}
        <footer className="shrink-0 border-t px-3 py-2 sm:px-4 sm:py-3 md:px-6">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-36 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </footer>
      </main>

      {/* Sidebar */}
      <div className="hidden md:flex h-full w-72 shrink-0 border-l bg-card/50 flex-col gap-3 p-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
