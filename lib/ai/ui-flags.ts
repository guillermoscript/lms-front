import 'server-only'

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

import { isAiConfigured } from './tenant-ai'

/**
 * UI-only flag: does this school have at least one ACTIVE AI provider key?
 * Server components use it to hide AI entry points (the Aristotle trigger,
 * panel and study section) instead of showing a button that can only fail.
 *
 * It is a convenience, not a gate: every AI route still resolves the model and
 * answers with a typed error (`ai_not_configured`, ...). Reads through the
 * boolean-only `tenant_ai_configured` RPC with the caller's RLS client; never
 * touches a credential. Fails closed (hidden) on any error.
 *
 * `cache()` dedupes it between a layout and the page under it in one request.
 */
export const getTenantAiEnabled = cache(async (): Promise<boolean> => {
  try {
    const [supabase, tenantId] = await Promise.all([createClient(), getCurrentTenantId()])
    const flags = await isAiConfigured(supabase, tenantId)
    return Object.values(flags).some(Boolean)
  } catch {
    return false
  }
})
