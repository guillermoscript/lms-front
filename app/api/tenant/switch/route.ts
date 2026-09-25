/**
 * Make a school the caller's active one — `POST /api/tenant/switch` (#845).
 *
 * On the web the subdomain decides the school: proxy.ts stamps
 * `app_metadata.tenant_id` to match it, so the JWT follows wherever you are.
 * The native app has no subdomain and reads the school from the JWT, so without
 * this route a student who picked school X in the app keeps seeing whichever
 * school the web last stamped (guillermoscript/lms-app#33).
 *
 * Body: `{ tenantId } | { slug }`, plus `join: true` once the user has said
 * yes to joining. A member is switched; a non-member is joined only where the
 * web would join them without asking (`canJoinWithoutAsking`) or with
 * `join: true` — otherwise 409 `join_required`, so the app can ask first, as
 * the web's join card does. Either way the answer carries the role, and the
 * client must call `supabase.auth.refreshSession()` for the new claims.
 *
 * Errors carry a stable `code`: `invalid_body` 400 · `school_not_found` 404 ·
 * `join_required` 409 · `student_limit` 409 · `switch_failed` 500.
 */
import { z } from 'zod'
import { getApiUser } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { canJoinWithoutAsking, joinSchool, setActiveTenant } from '@/lib/tenant/join-school'

export const dynamic = 'force-dynamic'

// Any 8-4-4-4-12 hex id: zod 4's `.uuid()` demands an RFC version nibble,
// which the seeded tenants (`00000000-…-000000000001`) do not have.
const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z
  .object({
    tenantId: z.string().regex(TENANT_ID).optional(),
    slug: z.string().trim().toLowerCase().min(1).max(63).optional(),
    join: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.tenantId) !== Boolean(b.slug), {
    message: 'Pass exactly one of tenantId or slug',
  })

export async function POST(req: Request) {
  const user = await getApiUser(req)
  if (!user) return Response.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: 'Pass exactly one of tenantId or slug', code: 'invalid_body' },
      { status: 400 }
    )
  }
  const { tenantId: requestedId, slug, join } = parsed.data

  // Service role throughout: the caller's JWT names the school they are
  // leaving, so their RLS client cannot see the one they are going to. Every
  // query below is filtered by the verified `user.id`.
  const admin = createAdminClient()

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, slug, name')
    .eq(requestedId ? 'id' : 'slug', (requestedId ?? slug)!)
    .eq('status', 'active')
    .maybeSingle()
  if (!tenant) {
    return Response.json({ error: 'School not found', code: 'school_not_found' }, { status: 404 })
  }
  const school = { tenantId: tenant.id, slug: tenant.slug, name: tenant.name }

  const { data: membership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .maybeSingle()

  if (membership) {
    if (!(await setActiveTenant(admin, user.id, tenant.id))) {
      return Response.json({ error: 'Failed to switch school', code: 'switch_failed' }, { status: 500 })
    }
    return Response.json({ ...school, role: membership.role, joined: false })
  }

  if (!join && !(await canJoinWithoutAsking({ admin, user, tenantId: tenant.id }))) {
    return Response.json(
      { error: 'Joining this school needs your confirmation', code: 'join_required', school },
      { status: 409 }
    )
  }

  const outcome = await joinSchool({ admin, user, tenantId: tenant.id })
  if (!outcome.ok) {
    // `already_member` means a concurrent request joined first — the metadata
    // is what is left to do.
    if (outcome.code === 'already_member') {
      const switched = await setActiveTenant(admin, user.id, tenant.id)
      const { data: row } = await admin
        .from('tenant_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .maybeSingle()
      if (switched && row) return Response.json({ ...school, role: row.role, joined: false })
    }
    if (outcome.code === 'student_limit') {
      return Response.json({ error: outcome.error, code: 'student_limit', school }, { status: 409 })
    }
    return Response.json({ error: outcome.error, code: 'switch_failed' }, { status: 500 })
  }

  return Response.json({ ...school, role: outcome.role, joined: true })
}
