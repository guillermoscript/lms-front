import { PageShell } from '@/components/dashboard/page-shell'
import { ExamBuilderSkeleton } from '../_builder-skeleton'

export default function Loading() {
  return (
    <PageShell variant="form" skeleton>
      <ExamBuilderSkeleton />
    </PageShell>
  )
}
