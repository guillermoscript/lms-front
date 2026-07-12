/**
 * Local-dev helper: mint real Supabase auth cookies for a seeded test user by
 * driving @supabase/ssr's own cookie serialization (so the name/format/chunking
 * match exactly what the app's server client expects). Lets browser automation
 * skip the flaky base-ui login form. LOCAL ONLY — uses seeded test passwords.
 *
 * Usage: npx tsx scripts/mint-session-cookies.ts <email> <password>
 * Prints a JSON array of { name, value } cookies to stdout.
 */
import { createServerClient } from '@supabase/ssr'
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k: string): string => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  if (!m) throw new Error(`missing ${k}`)
  return m[1].trim()
}

const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
const ANON = get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY')
const email = process.argv[2]
const password = process.argv[3]

;(async () => {
  let captured: { name: string; value: string }[] = []
  const client = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [],
      setAll: (cks: { name: string; value: string }[]) => { captured = cks },
    },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) { console.error('signIn failed:', error.message); process.exit(1) }
  process.stdout.write(JSON.stringify(captured))
})()
