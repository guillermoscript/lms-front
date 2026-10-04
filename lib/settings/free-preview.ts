/**
 * School-level switch for free lesson previews (issue #799, part 1 of 2).
 *
 * `lessons.is_preview` (20260722120000_lesson_preview.sql, #426) makes a
 * lesson readable by anyone, logged out, at
 * `/courses/:id/lessons/:lessonId`. 20260920120000_backfill_lesson_previews.sql
 * (#797) turned the first lesson of every EXISTING published course into a
 * free preview without asking, so a school that does not want to give
 * content away needs one switch that turns public preview access off for the
 * whole tenant — defaulting to ON, because that is what ships today.
 *
 * Stored as an ordinary `tenant_settings` row — `free_preview_enabled`,
 * `{ enabled: boolean }` — the same key/value shape every other admin toggle
 * uses (see `app/actions/admin/settings.ts`, e.g. `allow_self_enrollment`).
 * A missing row (new tenant, or one that predates this setting) means ON, so
 * nothing changes for existing schools.
 *
 * This is for the server-side code paths that read lessons with
 * `createAdminClient()` and therefore bypass RLS outright (the sitemap, the
 * public course page, the public lesson-preview page). The database enforces
 * the same default independently, for the `anon` PostgREST path — see the
 * "Anon can view preview lessons" policy in
 * `20260920130000_gate_preview_lessons_on_tenant_setting.sql` — so this
 * helper is a convenience for admin-client readers, never the only guard.
 */

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

export const FREE_PREVIEW_SETTING_KEY = 'free_preview_enabled'

/**
 * Whether this tenant allows logged-out visitors to read its preview
 * lessons. `cache()`d so a request that checks this from more than one place
 * (a layout, a page, the sitemap) pays for one read.
 */
export const isFreePreviewEnabled = cache(async (tenantId: string): Promise<boolean> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', FREE_PREVIEW_SETTING_KEY)
    .maybeSingle()

  const value = data?.setting_value as { enabled?: boolean } | null
  // Closed-world would silently take away access from every school that has
  // never touched this setting; default is OPEN (ON), matching what already
  // ships. Only an explicit `enabled: false` turns it off.
  return value?.enabled !== false
})

/**
 * How many published lessons are currently marked as a free preview for this
 * tenant, across every course. Shown next to the admin switch so "what did
 * that migration do to my content?" has an answer instead of a hunt (#797).
 */
export async function countPreviewLessons(tenantId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_preview', true)
  return count ?? 0
}
