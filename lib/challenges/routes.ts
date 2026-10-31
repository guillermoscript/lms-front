/**
 * Where a challenge link lives for each audience. The public landing
 * (`/reto/<token>`, guests and non-members) and the member route inside the
 * dashboard shell render the same components; this decides who goes where.
 */
export const publicChallengePath = (token: string) => `/reto/${encodeURIComponent(token)}`
export const memberChallengePath = (token: string) => `/dashboard/student/challenges/${encodeURIComponent(token)}`

/**
 * `/reto/<token>` sends a signed-in ACTIVE student to the dashboard route. Not
 * during `?claim=1` (a member with a guest cookie still has an attempt to
 * claim there) and not for teachers/admins (proxy.ts keeps them out of
 * /dashboard/student).
 */
export function shouldRedirectToDashboard(v: { viewerIsMember: boolean; role: string | null | undefined; claiming: boolean }): boolean {
  return v.viewerIsMember && v.role === 'student' && !v.claiming
}
