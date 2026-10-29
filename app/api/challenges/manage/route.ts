import { createAdminClient } from '@/lib/supabase/admin'
import { getBearerUser } from '@/lib/supabase/api-auth'
import { hasPlanFeature } from '@/lib/plans/server'
import { tenantOrigin } from '@/lib/tenant/origin'
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
  const user = await getBearerUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const claims = decodeClaims(token)
  const tenantId = typeof claims.tenant_id === 'string' ? claims.tenant_id : null
  if (!tenantId) return Response.json({ error: 'Tenant context missing from token' }, { status: 401 })

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
      return Response.json({ ...r.data, path, url: `${tenantOrigin(tenant)}${path}` })
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

function decodeClaims(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}
