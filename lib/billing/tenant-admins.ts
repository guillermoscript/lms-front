/**
 * Resolve the active admin emails for a tenant. `profiles` has no email
 * column, so emails come from the auth admin API keyed by tenant_users
 * membership. Shared by the platform-subscription cron and the
 * access-cutoff reconciler so both notify the same audience the same way.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getTenantAdminEmails(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  const { data: adminUsers } = await supabase
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('status', 'active')

  const emails: string[] = []
  for (const admin of adminUsers || []) {
    const { data: authUser } = await supabase.auth.admin.getUserById(admin.user_id)
    if (authUser?.user?.email) emails.push(authUser.user.email)
  }
  return emails
}
