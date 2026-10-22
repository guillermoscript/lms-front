import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractGlobalParts, type GlobalParts } from './global-parts'

/**
 * The school's global header/footer: its published `header` / `footer` landing_pages rows
 * (edited under Admin → Landing page → Site header & footer). A school that has not made
 * them yet falls back to the Header/Footer blocks of its published home page.
 */
export async function getGlobalParts(tenantId: string): Promise<GlobalParts> {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('landing_pages')
    .select('kind, puck_data')
    .eq('tenant_id', tenantId)
    .eq('is_published', true)
    .in('kind', ['header', 'footer'])
  const own = (kind: 'header' | 'footer') => {
    const row = rows?.find((r) => r.kind === kind)
    return row ? extractGlobalParts(row.puck_data)[kind] ?? null : null
  }
  const header = own('header')
  const footer = own('footer')
  if (header && footer) return { header, footer }

  const { data: home } = await admin
    .from('landing_pages')
    .select('puck_data')
    .eq('tenant_id', tenantId)
    .eq('slug', 'home')
    .eq('kind', 'page')
    .eq('is_published', true)
    .maybeSingle()
  const fallback = extractGlobalParts(home?.puck_data)
  return { header: header ?? fallback.header, footer: footer ?? fallback.footer }
}
