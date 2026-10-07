import { PageShell, PageHeaderSkeleton } from '@/components/dashboard/page-shell'

// exams/page.tsx only redirects to the course page's Exams tab; this covers
// the instant before the redirect resolves.
export default function Loading() {
  return (
    <PageShell variant="wide" skeleton>
      <PageHeaderSkeleton back />
    </PageShell>
  )
}
