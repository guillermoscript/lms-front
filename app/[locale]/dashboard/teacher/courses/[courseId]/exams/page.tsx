import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ courseId: string }>
}

/**
 * The exam list lives on the course page's Exams tab; this index only exists
 * so `/dashboard/teacher/courses/<id>/exams` (a URL the breadcrumbs and the
 * exam builder both imply) resolves instead of 404ing (#729).
 */
export default async function ExamsIndexPage({ params }: PageProps) {
  const { courseId } = await params
  redirect(`/dashboard/teacher/courses/${courseId}?tab=exams`)
}
