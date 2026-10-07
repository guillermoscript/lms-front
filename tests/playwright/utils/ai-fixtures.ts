/**
 * BYOK e2e fixture: gives a seeded tenant a (synthetic) provider key and a default model, so AI
 * routes get past model resolution. The key is never sent anywhere that the spec depends on
 * (e.g. attachments are persisted before the provider is called). Needs the same
 * AI_KEYS_ENCRYPTION_KEYS / AI_KEYS_ACTIVE_VERSION the app server runs with (set in ci.yml).
 */
import { createClient } from '@supabase/supabase-js'
import { encryptKey, getActiveKeyVersion } from '../../../lib/ai/byok/crypto-core'

const SYNTHETIC_KEY = 'sk-e2e-synthetic-not-a-real-key'

export function aiKeysConfigured(): boolean {
  return Boolean(process.env.AI_KEYS_ENCRYPTION_KEYS && process.env.AI_KEYS_ACTIVE_VERSION)
}

export async function seedTenantAi(tenantSlug: string, provider = 'openai', model = 'gpt-4o-mini'): Promise<void> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: tenant, error: tErr } = await admin.from('tenants').select('id').eq('slug', tenantSlug).single()
  if (tErr || !tenant) throw new Error(`tenant ${tenantSlug} not found`)

  const { error: cErr } = await admin.from('tenant_ai_credentials').upsert(
    {
      tenant_id: tenant.id,
      provider,
      key_ciphertext: encryptKey(SYNTHETIC_KEY, { tenantId: tenant.id, provider }),
      key_version: getActiveKeyVersion(),
      key_last4: SYNTHETIC_KEY.slice(-4),
      status: 'active',
    },
    { onConflict: 'tenant_id,provider' },
  )
  if (cErr) throw new Error(`seed credential failed: ${cErr.message}`)

  const { error: sErr } = await admin
    .from('tenant_ai_settings')
    .upsert({ tenant_id: tenant.id, default_provider: provider, default_model: model }, { onConflict: 'tenant_id' })
  if (sErr) throw new Error(`seed settings failed: ${sErr.message}`)
}

/**
 * The synthetic key is rejected by the real provider (401), and a rejected key is auto-flipped to
 * `invalid` — which is the product working. A spec that reloads the page afterwards wants the chat
 * UI, not the "fix your key" state, so wait (briefly) for that flip to land and re-activate the key.
 */
export async function reactivateTenantAi(tenantSlug: string, provider = 'openai'): Promise<void> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: tenant } = await admin.from('tenants').select('id').eq('slug', tenantSlug).single()
  if (!tenant) throw new Error(`tenant ${tenantSlug} not found`)
  // No network (or a slow provider) means no flip: stop waiting and re-activate anyway.
  for (let i = 0; i < 20; i++) {
    const { data } = await admin
      .from('tenant_ai_credentials')
      .select('status')
      .eq('tenant_id', tenant.id)
      .eq('provider', provider)
      .single()
    if (data?.status !== 'active') break
    await new Promise((r) => setTimeout(r, 500))
  }
  await admin
    .from('tenant_ai_credentials')
    .update({ status: 'active', last_error_code: null })
    .eq('tenant_id', tenant.id)
    .eq('provider', provider)
}
