import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Emails live in auth.users (profiles has none). Instead of one `getUserById`
 * round trip per user (N+1), page `auth.admin.listUsers` — 1000 users per
 * request — and stop as soon as every wanted id has been seen.
 * Service-role client required. Emails are display-only: on error the result
 * degrades to whatever was collected (blanks) rather than failing the page.
 */
export async function fetchAuthEmails(
  admin: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const emails = new Map<string, string>()
  const wanted = new Set(userIds)
  if (wanted.size === 0) return emails
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error(`[fetchAuthEmails] listUsers page ${page} failed: ${error.message}`)
      break
    }
    const users = data?.users ?? []
    for (const u of users) {
      if (u.email && wanted.has(u.id)) emails.set(u.id, u.email)
    }
    if (users.length < perPage || emails.size === wanted.size) break
  }
  return emails
}
