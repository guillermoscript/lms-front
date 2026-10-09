/**
 * A frozen platform fee statement as JSON (#929, design 2.5). NON-FISCAL:
 * "Statement, not a tax invoice". Readable by an active admin of the owning
 * school (on that school's own host) or by a super admin. Rendered by the
 * statement page; per-currency lines, rate + source per converted currency.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { loadFeeStatement, STATEMENT_NUMBER_PATTERN } from '@/lib/billing/platform-fee-statement'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ statementNumber: string }> },
) {
  try {
    const { statementNumber } = await params
    if (!STATEMENT_NUMBER_PATTERN.test(statementNumber)) {
      return NextResponse.json({ error: 'Statement not found', code: 'not_found' }, { status: 404 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    // Same 404 for "missing" and "someone else's" — never confirm a number exists.
    const notFound = NextResponse.json({ error: 'Statement not found', code: 'not_found' }, { status: 404 })

    // Authorize on the owning tenant BEFORE loading the ledger behind the status.
    const { data: owner } = await admin
      .from('platform_fee_statements')
      .select('tenant_id')
      .eq('statement_number', statementNumber)
      .maybeSingle()
    if (!owner) return notFound

    if (!(await isSuperAdmin())) {
      const tenantId = await getCurrentTenantId()
      if (owner.tenant_id !== tenantId) return notFound
      const { data: membership } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .maybeSingle()
      if (!membership || membership.role !== 'admin') return notFound
    }

    const statement = await loadFeeStatement(admin, statementNumber)
    if (!statement) return notFound

    return NextResponse.json({ statement }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[billing/fees/statements] error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Internal server error', code: 'internal' }, { status: 500 })
  }
}
