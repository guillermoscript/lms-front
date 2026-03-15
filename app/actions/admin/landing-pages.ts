'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import type { Data } from '@measured/puck'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LandingPage {
  id: string        // mapped from page_id
  tenant_id: string
  name: string      // mapped from title
  slug: string
  puck_data: Data
  is_active: boolean // mapped from is_published
  status: 'draft' | 'published' // derived from is_published
  created_at: string
  updated_at: string
}

export interface LandingPageTemplate {
  id: string
  name: string
  description: string
  category: string
  puck_data: Data
  is_active: boolean
  sort_order: number
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

/** Map a DB row (page_id, title, is_published) to our LandingPage interface */
function mapRow(row: Record<string, unknown>): LandingPage {
  return {
    id: row.page_id as string,
    tenant_id: row.tenant_id as string,
    name: row.title as string,
    slug: row.slug as string,
    puck_data: row.puck_data as Data,
    is_active: row.is_published as boolean,
    status: (row.is_published as boolean) ? 'published' : 'draft',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

// ─── Validation helpers ──────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 255
const MAX_SLUG_LENGTH = 100
const RESERVED_SLUGS = ['api', 'dashboard', 'admin', 'auth', 'login', 'signup', 'register']

function sanitizeSlug(raw: string | undefined): string {
  const slug = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
  return slug || 'home'
}

function validateName(name: string): string | null {
  if (!name?.trim()) return 'Page name is required'
  if (name.trim().length > MAX_NAME_LENGTH) return `Page name must be under ${MAX_NAME_LENGTH} characters`
  return null
}

function validateSlug(slug: string): string | null {
  if (RESERVED_SLUGS.includes(slug)) return `"${slug}" is a reserved path and cannot be used as a slug`
  return null
}

function friendlyDbError(err: unknown): string {
  const msg = err instanceof Error
    ? err.message
    : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)
  if (msg.includes('unique') || msg.includes('duplicate')) {
    return 'A page with this slug already exists. Please choose a different slug.'
  }
  return msg
}

// ─── Default Puck data ──────────────────────────────────────────────────────

const DEFAULT_PUCK_DATA: Data = {
  root: { props: {} },
  content: [],
  zones: {},
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getLandingPages(tenantId: string): Promise<ActionResult<LandingPage[]>> {
  try {
    await verifyAdminAccess()
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('landing_pages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return { success: true, data: (data ?? []).map(mapRow) }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage[]>
  }
}

export async function getLandingPage(id: string): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('landing_pages')
      .select('*')
      .eq('page_id', id)
      .eq('tenant_id', tenantId)
      .single()
    if (error) throw error
    return { success: true, data: mapRow(data) }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}

export async function getTemplates(): Promise<ActionResult<LandingPageTemplate[]>> {
  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('landing_page_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return { success: true, data: (data ?? []) as LandingPageTemplate[] }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPageTemplate[]>
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createLandingPage(
  name: string,
  puckData?: Data,
  slug?: string
): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const nameError = validateName(name)
    if (nameError) return { success: false, error: nameError } as ActionResult<LandingPage>

    const pageSlug = sanitizeSlug(slug)
    const slugError = validateSlug(pageSlug)
    if (slugError) return { success: false, error: slugError } as ActionResult<LandingPage>

    const { data, error } = await adminClient
      .from('landing_pages')
      .insert({
        tenant_id: tenantId,
        title: name.trim().slice(0, MAX_NAME_LENGTH),
        slug: pageSlug,
        puck_data: puckData ?? DEFAULT_PUCK_DATA,
        is_published: false,
      })
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: mapRow(data) }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}

export async function updateLandingPage(
  id: string,
  updates: { name?: string; slug?: string; puck_data?: Data }
): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    if (updates.name !== undefined) {
      const nameError = validateName(updates.name)
      if (nameError) return { success: false, error: nameError } as ActionResult<LandingPage>
    }

    // Verify ownership
    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id')
      .eq('page_id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

    const sanitized: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.name) {
      sanitized.title = updates.name.trim().slice(0, MAX_NAME_LENGTH)
    }
    if (updates.slug) {
      const pageSlug = sanitizeSlug(updates.slug)
      const slugError = validateSlug(pageSlug)
      if (slugError) return { success: false, error: slugError } as ActionResult<LandingPage>
      sanitized.slug = pageSlug
    }
    if (updates.puck_data) {
      sanitized.puck_data = updates.puck_data
    }

    const { data, error } = await adminClient
      .from('landing_pages')
      .update(sanitized)
      .eq('page_id', id)
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: mapRow(data) }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}

export async function publishLandingPage(id: string): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id, slug')
      .eq('page_id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

    const { data, error } = await adminClient
      .from('landing_pages')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('page_id', id)
      .select()
      .single()
    if (error) throw error

    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    revalidatePath('/[locale]', 'page')
    if (existing.slug !== 'home') {
      revalidatePath(`/[locale]/p/${existing.slug}`, 'page')
    }
    return { success: true, data: mapRow(data) }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}

export async function activateLandingPage(id: string): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('landing_pages')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('page_id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()
    if (error) throw error

    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    revalidatePath('/[locale]', 'page')
    return { success: true, data: mapRow(data) }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}

export async function deactivateLandingPage(id: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id, slug')
      .eq('page_id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

    const { error } = await adminClient
      .from('landing_pages')
      .update({ is_published: false })
      .eq('page_id', id)
    if (error) throw error

    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    revalidatePath('/[locale]', 'page')
    if (existing.slug !== 'home') {
      revalidatePath(`/[locale]/p/${existing.slug}`, 'page')
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) }
  }
}

export async function deleteLandingPage(id: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id, is_published')
      .eq('page_id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')
    if (existing.is_published) throw new Error('Cannot delete a published page. Unpublish it first.')

    const { error } = await adminClient
      .from('landing_pages')
      .delete()
      .eq('page_id', id)
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) }
  }
}

export async function duplicateLandingPage(id: string, newName: string): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const nameError = validateName(newName)
    if (nameError) return { success: false, error: nameError } as ActionResult<LandingPage>

    const { data: original } = await adminClient
      .from('landing_pages')
      .select('*')
      .eq('page_id', id)
      .eq('tenant_id', tenantId)
      .single()
    if (!original) throw new Error('Landing page not found')

    const baseSlug = original.slug
    const suffix = `-copy-${Date.now().toString(36)}`
    const dupSlug = `${baseSlug}${suffix}`.slice(0, MAX_SLUG_LENGTH)

    const { data, error } = await adminClient
      .from('landing_pages')
      .insert({
        tenant_id: tenantId,
        title: newName.trim().slice(0, MAX_NAME_LENGTH),
        slug: dupSlug,
        puck_data: original.puck_data,
        is_published: false,
      })
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: mapRow(data) }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}
