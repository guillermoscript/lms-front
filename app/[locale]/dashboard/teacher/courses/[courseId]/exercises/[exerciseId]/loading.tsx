import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'
import { ExerciseBuilderSkeleton } from '../_builder-skeleton'

// Same shell + header as new/page.tsx and [exerciseId]/page.tsx.
export default function Loading() {
  return (
    <PageShell variant="form" skeleton>
      <PageHeaderSkeleton back description={false} />
      <ExerciseBuilderSkeleton />
    </PageShell>
  )
}
