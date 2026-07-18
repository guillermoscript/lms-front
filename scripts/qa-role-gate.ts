/**
 * QA-only: prove /api/landing/generate role gating end-to-end.
 * anon → 401 · student → 403 · admin (empty body) → 400 "messages required",
 * which proves the admin passed the role + plan gates without invoking the AI.
 * Sends the session as @supabase/ssr cookies so the server client picks it up.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error('local-only')

const APP = 'http://free-academy.lvh.me:3005'
const ref = new URL(url).hostname.split('.')[0] // "127" for local — matches supabase-js default storageKey

async function callAs(email: string | null, body: unknown): Promise<number> {
  let cookie = ''
  if (email) {
    const sb = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await sb.auth.signInWithPassword({ email, password: 'password123' })
    if (error) throw new Error(email + ': ' + error.message)
    const cookieVal = 'base64-' + Buffer.from(JSON.stringify(data.session)).toString('base64url')
    // @supabase/ssr chunks long cookies
    const chunks: string[] = []
    for (let i = 0; i < cookieVal.length; i += 3180) chunks.push(cookieVal.slice(i, i + 3180))
    cookie = chunks.length === 1
      ? `sb-${ref}-auth-token=${chunks[0]}`
      : chunks.map((c, i) => `sb-${ref}-auth-token.${i}=${c}`).join('; ')
  }
  const res = await fetch(`${APP}/api/landing/generate`, {
    method: 'POST',
    headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.status
}

async function main() {
  const msg = { messages: [{ role: 'user', content: 'test' }] }
  const anonStatus = await callAs(null, msg)
  const student = await callAs('student@freeacademy.com', msg)
  const admin = await callAs('admin@freeacademy.com', { messages: [] })
  console.log({ anonStatus, student, admin })
  const ok = anonStatus === 401 && student === 403 && admin === 400
  console.log(ok ? '✅ role gate works (anon 401, student 403, admin passes gates → 400 empty-body)' : '❌ unexpected statuses')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => { console.error('❌', e.message); process.exit(1) })
