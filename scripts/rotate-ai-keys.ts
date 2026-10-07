/**
 * Re-encrypts every tenant BYOK AI credential under the ACTIVE master-key
 * version (AI_KEYS_ACTIVE_VERSION).
 *
 * Rotation runbook:
 *   1. Add the new key to AI_KEYS_ENCRYPTION_KEYS (keep the old ones), e.g.
 *      {"1":"<old>","2":"<new>"}; set AI_KEYS_ACTIVE_VERSION=2; deploy.
 *      (New writes + lazy re-encrypt on read now use v2.)
 *   2. Run:  npx tsx scripts/rotate-ai-keys.ts            (dry run, default)
 *            npx tsx scripts/rotate-ai-keys.ts --apply    (writes)
 *   3. Re-run until it reports 0 pending, then drop the old version from env.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from the
 * shell or .env.local). Never prints keys or ciphertext; row ids only.
 * Each update is guarded on the old ciphertext, so a concurrent rewrite by
 * the app is never clobbered (the row is simply skipped and picked up next run).
 */
import { createClient } from '@supabase/supabase-js'
import {
  decryptKey,
  encryptKey,
  getActiveKeyVersion,
  needsReencrypt,
  ByokCryptoError,
} from '../lib/ai/byok/crypto-core'

const PAGE = 500

async function main() {
  try {
    process.loadEnvFile('.env.local')
  } catch {
    // env may come from the shell
  }
  const apply = process.argv.includes('--apply')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

  const active = getActiveKeyVersion() // also validates env, fails closed
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let scanned = 0
  let current = 0
  let rotated = 0
  let skipped = 0
  const failed: string[] = []
  let lastId = ''

  console.log(`[rotate-ai-keys] active version v${active} - ${apply ? 'APPLY' : 'DRY RUN'}`)

  for (;;) {
    let q = supabase
      .from('tenant_ai_credentials')
      .select('id, tenant_id, provider, key_ciphertext, key_version')
      .order('id', { ascending: true })
      .limit(PAGE)
    if (lastId) q = q.gt('id', lastId)
    const { data, error } = await q
    if (error) throw new Error(`read failed: ${error.code ?? ''} ${error.message}`)
    if (!data || data.length === 0) break

    for (const row of data) {
      scanned++
      lastId = row.id
      try {
        if (!needsReencrypt(row.key_ciphertext)) {
          current++
          continue
        }
        if (!apply) {
          rotated++
          continue
        }
        const ctx = { tenantId: row.tenant_id, provider: row.provider }
        const next = encryptKey(decryptKey(row.key_ciphertext, ctx), ctx)
        const { data: updated, error: upErr } = await supabase
          .from('tenant_ai_credentials')
          .update({ key_ciphertext: next, key_version: active, updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('tenant_id', row.tenant_id)
          .eq('key_ciphertext', row.key_ciphertext)
          .select('id')
        if (upErr) throw new Error(`update failed: ${upErr.code ?? ''}`)
        if (!updated || updated.length === 0) skipped++
        else rotated++
      } catch (e) {
        const reason = e instanceof ByokCryptoError ? e.code : (e as Error).name
        failed.push(`${row.id} (${reason})`)
      }
    }
    if (data.length < PAGE) break
  }

  console.log(
    `[rotate-ai-keys] scanned=${scanned} already-current=${current} ${apply ? 'rotated' : 'pending'}=${rotated} ` +
      `raced-skipped=${skipped} failed=${failed.length}`
  )
  for (const f of failed) console.error(`[rotate-ai-keys] FAILED row ${f}`)
  if (failed.length > 0) process.exit(1)
}

main().catch((e) => {
  console.error(`[rotate-ai-keys] ${(e as Error).name}: ${(e as Error).message}`)
  process.exit(1)
})
