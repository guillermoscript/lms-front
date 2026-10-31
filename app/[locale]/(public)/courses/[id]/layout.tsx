import { headers } from 'next/headers'
import { permanentRedirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { parseSlugId, withSlug } from '@/lib/slug'

/**
 * The canonical-slug redirect has to happen here, not in page.tsx: the route's
 * loading.tsx makes the page stream, so by the time the page redirects the
 * 200 is already sent and the browser/crawler gets a `<meta refresh>` instead
 * of a 308. A layout runs before that boundary. It only knows the course
 * segment; the rest of the path and the query string (e.g. `?enroll=1`)
 * come from the headers proxy.ts sets, and the lesson segment keeps its own
 * check in the lesson page.
 */
export default async function CourseSegmentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const courseId = parseSlugId(id)
  if (courseId !== null) {
    const supabase = await createClient()
    const { data: course } = await supabase
      .from('courses')
      .select('course_id, title')
      .eq('course_id', courseId)
      .eq('tenant_id', await getCurrentTenantId())
      .eq('status', 'published')
      .maybeSingle()

    if (course) {
      const slug = withSlug(course.course_id, course.title)
      const h = await headers()
      const pathname = h.get('x-pathname') ?? ''
      const match = /^(.*\/courses\/)([^/]+)(\/.*)?$/.exec(pathname)
      let current = match?.[2] ?? ''
      try {
        current = decodeURIComponent(current)
      } catch {
        // A malformed escape is not the canonical slug either.
      }
      if (match && current !== slug) {
        permanentRedirect(`${match[1]}${slug}${match[3] ?? ''}${h.get('x-search') ?? ''}`)
      }
    }
  }
  return children
}
