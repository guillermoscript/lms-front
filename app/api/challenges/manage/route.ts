import { createAdminClient } from '@/lib/supabase/admin'
import { getBearerContext } from '@/lib/supabase/api-auth'
import { hasPlanFeature } from '@/lib/plans/server'
import { requireTenantOrigin } from '@/lib/tenant/origin'
import {
  CHALLENGE_PUBLIC_WARNING,
  createLinkCore,
  deactivateLinkCore,
  setChallengeableCore,
  type ChallengeActor,
  type ChallengeRole,
} from '@/lib/challenges/links'

/**
 * Challenge management for the LMS MCP server (WS9 #1043). `challenge_links`
 * is server-write only, so the MCP tools forward the caller's own Supabase
 * token here and the SAME core as the web actions (`lib/challenges/links.ts`)
 * runs the rules. Bearer-only: session cookies are ignored on purpose.
 *
 * Body: { action: 'set_challengeable' | 'create_link' | 'deactivate_link', ... }
 * The tenant and role come from the verified JWT / tenant_users, never the body.
 */
export async function POST(req: Request) {
  // Verified bearer token; tenant from the JWT claim or the single active membership.
  const token = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  const auth = token ? await getBearerContext(token) : null
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, tenantId } = auth

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()
  // `tenant_users` is authoritative for role and membership (not the JWT claim).
  const { data: membership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  const role = membership?.role as ChallengeRole | undefined
  if (role !== 'student' && role !== 'teacher' && role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const actor: ChallengeActor = { tenantId, userId: user.id, role }
  const deps = { admin, hasAiGrading: (id: string) => hasPlanFeature(id, 'ai_grading') }

  const bad = (error: string, status = 400) => Response.json({ error }, { status })
  const num = (v: unknown) => (typeof v === 'number' ? v : Number.NaN)

  switch (body.action) {
    case 'set_challengeable': {
      const r = await setChallengeableCore(deps, actor, num(body.exerciseId), body.enabled as boolean)
      if (!r.ok) return bad(r.error, r.error === 'Unauthorized' ? 403 : 422)
      return Response.json({
        exerciseId: r.data.exerciseId,
        isChallengeable: r.data.isChallengeable,
        warning: r.data.isChallengeable ? CHALLENGE_PUBLIC_WARNING : null,
      })
    }
    case 'create_link': {
      const r = await createLinkCore(deps, actor, {
        exerciseId: body.exerciseId === undefined ? undefined : num(body.exerciseId),
        attemptId: typeof body.attemptId === 'string' ? body.attemptId : undefined,
        useBestAttempt: body.useBestAttempt === true,
      })
      if (!r.ok) return bad(r.error, r.error === 'Unauthorized' ? 403 : 422)
      const { data: tenant } = await admin.from('tenants').select('slug, domain').eq('id', tenantId).maybeSingle()
      const path = `/reto/${r.data.token}`
      let origin: string
      try {
        origin = requireTenantOrigin(tenant)
      } catch (err) {
        console.error('challenge link origin', err)
        return bad('The school URL is not configured on the server', 500)
      }
      return Response.json({ ...r.data, path, url: `${origin}${path}` })
    }
    case 'deactivate_link': {
      if (typeof body.token !== 'string') return bad('token is required')
      const r = await deactivateLinkCore(deps, actor, { token: body.token })
      if (!r.ok) return bad(r.error, r.error === 'Unauthorized' ? 403 : r.error === 'Link not found' ? 404 : 422)
      return Response.json({ deactivated: true })
    }
    default:
      return bad('Unknown action')
  }
}
