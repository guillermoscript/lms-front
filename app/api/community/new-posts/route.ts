import { loadNewPosts } from '@/app/actions/community'

/** Background reads must not dispatch a Server Action into the client router. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const scope = params.get('scope')
  const since = params.get('since')
  const course = params.get('courseId')
  const courseId = course === null ? undefined : Number(course)
  const headers = { 'Cache-Control': 'private, no-store' }

  if ((scope !== 'school' && scope !== 'course') || !since ||
      Number.isNaN(Date.parse(since)) ||
      (courseId !== undefined && (!Number.isSafeInteger(courseId) || courseId <= 0)) ||
      (scope === 'course' && courseId === undefined)) {
    return Response.json({ success: false, error: 'Invalid feed cursor' }, { status: 400, headers })
  }

  // Reuse the authenticated tenant/course access gate and filtered feed query.
  const result = await loadNewPosts(scope, since, courseId, params.get('questions'))
  return Response.json(result, { status: result.success ? 200 : 403, headers })
}
