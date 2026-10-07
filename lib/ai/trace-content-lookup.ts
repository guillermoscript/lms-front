/**
 * Reads a tenant's `ai_trace_content` preference for the Langfuse guard
 * (lib/ai/trace-content-guard.ts). Missing row = true (the column default).
 * A read error THROWS so the guard fails private. Service-role read, filtered
 * by tenant and re-checked against it; returns a boolean, nothing else.
 *
 * Lives outside `server-only` modules because `instrumentation.ts` loads it
 * lazily on the first AI span, outside the route graph.
 */
export async function lookupTraceContentAllowed(tenantId: string): Promise<boolean> {
  // Direct service-role client: `lib/supabase/admin` pulls in `next/headers`,
  // which the instrumentation bundle cannot import.
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('trace-content lookup failed')
  const { data, error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    .from('tenant_ai_settings')
    .select('tenant_id, ai_trace_content')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error('trace-content lookup failed')
  if (!data || data.tenant_id !== tenantId) return true
  return data.ai_trace_content !== false
}
