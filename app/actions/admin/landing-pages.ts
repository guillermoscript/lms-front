'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import type { LandingPage, LandingSection, LandingPageSettings, LandingPageTemplate } from '@/lib/landing-pages/types'
import { createSection } from '@/lib/landing-pages/section-defaults'

// ─── Validation helpers ──────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 255
const MAX_SLUG_LENGTH = 100
const MAX_SECTIONS = 50
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

function validateSections(sections: LandingSection[]): string | null {
  if (!Array.isArray(sections)) return 'Sections must be an array'
  if (sections.length > MAX_SECTIONS) return `Maximum ${MAX_SECTIONS} sections allowed`
  for (const s of sections) {
    if (!s.id || typeof s.id !== 'string') return 'Each section must have a valid id'
    if (!s.type || typeof s.type !== 'string') return 'Each section must have a valid type'
    if (typeof s.visible !== 'boolean') return 'Each section must have a visible flag'
    if (!s.data || typeof s.data !== 'object') return 'Each section must have a data object'
  }
  return null
}

function friendlyDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('unique') || msg.includes('duplicate')) {
    return 'A page with this slug already exists. Please choose a different slug.'
  }
  return msg
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
    return { success: true, data: (data ?? []) as LandingPage[] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch landing pages' } as ActionResult<LandingPage[]>
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
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    if (error) throw error
    return { success: true, data: data as LandingPage }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch landing page' } as ActionResult<LandingPage>
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
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch templates' } as ActionResult<LandingPageTemplate[]>
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createLandingPage(
  name: string,
  sections?: LandingSection[],
  slug?: string
): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Validate inputs
    const nameError = validateName(name)
    if (nameError) return { success: false, error: nameError } as ActionResult<LandingPage>

    const pageSlug = sanitizeSlug(slug)
    const slugError = validateSlug(pageSlug)
    if (slugError) return { success: false, error: slugError } as ActionResult<LandingPage>

    const defaultSections = sections ?? [createSection('hero')]
    const sectionsError = validateSections(defaultSections)
    if (sectionsError) return { success: false, error: sectionsError } as ActionResult<LandingPage>

    const { data, error } = await adminClient
      .from('landing_pages')
      .insert({
        tenant_id: tenantId,
        name: name.trim().slice(0, MAX_NAME_LENGTH),
        slug: pageSlug,
        sections: defaultSections,
        settings: {},
        is_active: false,
        status: 'draft',
      })
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: data as LandingPage }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}

export async function updateLandingPage(
  id: string,
  updates: { name?: string; slug?: string; sections?: LandingSection[]; settings?: LandingPageSettings }
): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Validate name if provided
    if (updates.name !== undefined) {
      const nameError = validateName(updates.name)
      if (nameError) return { success: false, error: nameError } as ActionResult<LandingPage>
    }

    // Validate sections if provided
    if (updates.sections) {
      const sectionsError = validateSections(updates.sections)
      if (sectionsError) return { success: false, error: sectionsError } as ActionResult<LandingPage>
    }

    // Verify ownership
    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id')
      .eq('id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

    const sanitized: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
    if (updates.name) {
      sanitized.name = updates.name.trim().slice(0, MAX_NAME_LENGTH)
    }
    if (updates.slug) {
      const pageSlug = sanitizeSlug(updates.slug)
      const slugError = validateSlug(pageSlug)
      if (slugError) return { success: false, error: slugError } as ActionResult<LandingPage>
      sanitized.slug = pageSlug
    }

    const { data, error } = await adminClient
      .from('landing_pages')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: data as LandingPage }
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
      .select('tenant_id')
      .eq('id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

    const { data, error } = await adminClient
      .from('landing_pages')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: data as LandingPage }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to publish landing page' } as ActionResult<LandingPage>
  }
}

export async function activateLandingPage(id: string): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Use atomic RPC to prevent race conditions
    const { error: rpcError } = await adminClient.rpc('activate_landing_page', {
      _page_id: id,
      _tenant_id: tenantId,
    })
    if (rpcError) throw rpcError

    // Fetch updated page to return
    const { data, error } = await adminClient
      .from('landing_pages')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: data as LandingPage }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to activate landing page' } as ActionResult<LandingPage>
  }
}

export async function deactivateLandingPage(id: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id')
      .eq('id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

    const { error } = await adminClient
      .from('landing_pages')
      .update({ is_active: false })
      .eq('id', id)
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to deactivate landing page' }
  }
}

export async function deleteLandingPage(id: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id, is_active')
      .eq('id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')
    if (existing.is_active) throw new Error('Cannot delete an active page. Deactivate it first.')

    const { error } = await adminClient
      .from('landing_pages')
      .delete()
      .eq('id', id)
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete landing page' }
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
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    if (!original) throw new Error('Landing page not found')

    // Generate unique slug for the duplicate
    const baseSlug = original.slug
    const suffix = `-copy-${Date.now().toString(36)}`
    const dupSlug = `${baseSlug}${suffix}`.slice(0, MAX_SLUG_LENGTH)

    const { data, error } = await adminClient
      .from('landing_pages')
      .insert({
        tenant_id: tenantId,
        name: newName.trim().slice(0, MAX_NAME_LENGTH),
        slug: dupSlug,
        sections: original.sections,
        settings: original.settings,
        is_active: false,
        status: 'draft',
      })
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: data as LandingPage }
  } catch (err) {
    return { success: false, error: friendlyDbError(err) } as ActionResult<LandingPage>
  }
}
