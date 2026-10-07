import { PageShell } from '@/components/dashboard/page-shell'
import { LessonEditorSkeleton } from '../_editor-skeleton'

// Full-bleed editor: PageShell for status semantics only, padding zeroed.
export default function Loading() {
  return (
    <PageShell skeleton className="p-0 lg:p-0 space-y-0">
      <LessonEditorSkeleton />
    </PageShell>
  )
}
