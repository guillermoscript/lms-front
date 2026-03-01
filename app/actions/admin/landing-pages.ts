'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import type { LandingPage, LandingSection, LandingPageSettings, LandingPageTemplate } from '@/lib/landing-pages/types'
import { createSection } from '@/lib/landing-pages/section-defaults'

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
  sections?: LandingSection[]
): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()
    const defaultSections = sections ?? [createSection('hero')]
    const { data, error } = await adminClient
      .from('landing_pages')
      .insert({
        tenant_id: tenantId,
        name,
        slug: 'home',
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
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create landing page' } as ActionResult<LandingPage>
  }
}

export async function updateLandingPage(
  id: string,
  updates: { name?: string; sections?: LandingSection[]; settings?: LandingPageSettings }
): Promise<ActionResult<LandingPage>> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Verify ownership
    const { data: existing } = await adminClient
      .from('landing_pages')
      .select('tenant_id')
      .eq('id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

    const { data, error } = await adminClient
      .from('landing_pages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    revalidatePath('/[locale]/dashboard/admin/landing-page', 'page')
    return { success: true, data: data as LandingPage }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update landing page' } as ActionResult<LandingPage>
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

    const { data: page } = await adminClient
      .from('landing_pages')
      .select('tenant_id, slug, status')
      .eq('id', id)
      .single()
    if (!page || page.tenant_id !== tenantId) throw new Error('Access denied')
    if (page.status !== 'published') throw new Error('Page must be published before activating')

    // Deactivate all other pages with same slug
    await adminClient
      .from('landing_pages')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('slug', page.slug)
      .neq('id', id)

    const { data, error } = await adminClient
      .from('landing_pages')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
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
      .select('tenant_id')
      .eq('id', id)
      .single()
    if (!existing || existing.tenant_id !== tenantId) throw new Error('Access denied')

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

    const { data: original } = await adminClient
      .from('landing_pages')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    if (!original) throw new Error('Landing page not found')

    const { data, error } = await adminClient
      .from('landing_pages')
      .insert({
        tenant_id: tenantId,
        name: newName,
        slug: original.slug,
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
    return { success: false, error: err instanceof Error ? err.message : 'Failed to duplicate landing page' } as ActionResult<LandingPage>
  }
}
