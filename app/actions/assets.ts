'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'

export type AssetKind = 'image' | 'video' | 'document' | 'other'
export type AssetSource =
  | 'course'
  | 'landing_page'
  | 'certificate'
  | 'community'
  | 'ai_generated'
  | 'library'
  | 'other'

export interface TenantAsset {
  assetId: string
  name: string
  url: string
  bucket: string
  path: string
  mimeType: string | null
  sizeBytes: number | null
  kind: AssetKind
  source: AssetSource
  createdAt: string
}

export interface AssetUsage {
  label: string
  href: string | null
}

type Result<T> = ({ success: true } & T) | { success: false; error: string }

const PAGE_SIZE = 48

async function requireStaff() {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') throw new Error('Unauthorized')
  return { role, tenantId: await getCurrentTenantId() }
}

/**
 * The school's asset library, newest first. Reads through RLS
 * (`is_staff_of(tenant_id)`) with the tenant filter on top.
 */
export async function listTenantAssets(opts: {
  kind?: AssetKind
  source?: AssetSource
  search?: string
  page?: number
}): Promise<Result<{ assets: TenantAsset[]; total: number; pageSize: number; usedBytes: number }>> {
  try {
    const { tenantId } = await requireStaff()
    const supabase = await createClient()
    const page = Math.max(0, opts.page ?? 0)

    let query = supabase
      .from('tenant_assets')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (opts.kind) query = query.eq('kind', opts.kind)
    if (opts.source) query = query.eq('source', opts.source)
    const search = opts.search?.trim().replace(/[%_,()]/g, '')
    if (search) query = query.ilike('name', `%${search}%`)

    const { data, error, count } = await query
    if (error) throw error

    // Storage used by the whole school (not just this page / filter).
    const { data: sizes } = await supabase
      .from('tenant_assets')
      .select('size_bytes')
      .eq('tenant_id', tenantId)
      .limit(10000)
    const usedBytes = (sizes ?? []).reduce((sum, r) => sum + (r.size_bytes ?? 0), 0)

    const admin = createAdminClient()
    const assets = (data ?? []).map((r): TenantAsset => ({
      assetId: r.asset_id,
      name: r.name,
      url: admin.storage.from(r.bucket).getPublicUrl(r.path).data.publicUrl,
      bucket: r.bucket,
      path: r.path,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      kind: r.kind as AssetKind,
      source: r.source as AssetSource,
      createdAt: r.created_at,
    }))

    return { success: true, assets, total: count ?? assets.length, pageSize: PAGE_SIZE, usedBytes }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to list assets' }
  }
}

/** Where an asset is referenced, so deleting it never silently breaks a page. */
async function findUsages(tenantId: string, bucket: string, path: string): Promise<AssetUsage[]> {
  const admin = createAdminClient()
  const url = admin.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const usages: AssetUsage[] = []

  const [courses, templates, pages, settings] = await Promise.all([
    admin
      .from('courses')
      .select('course_id, title')
      .eq('tenant_id', tenantId)
      .eq('thumbnail_url', url),
    admin
      .from('certificate_templates')
      .select('template_id, template_name, logo_url, signature_image_url')
      .eq('tenant_id', tenantId),
    admin.from('landing_pages').select('page_id, title, puck_data').eq('tenant_id', tenantId),
    admin.from('tenant_settings').select('setting_key, setting_value').eq('tenant_id', tenantId),
  ])

  for (const c of courses.data ?? []) {
    usages.push({ label: `Course: ${c.title}`, href: `/dashboard/teacher/courses/${c.course_id}` })
  }
  for (const t of templates.data ?? []) {
    if (t.logo_url === url || t.signature_image_url === url) {
      usages.push({ label: `Certificate: ${t.template_name}`, href: null })
    }
  }
  for (const p of pages.data ?? []) {
    if (JSON.stringify(p.puck_data ?? {}).includes(url)) {
      usages.push({ label: `Landing page: ${p.title}`, href: '/dashboard/admin/landing-page' })
    }
  }
  for (const s of settings.data ?? []) {
    if (JSON.stringify(s.setting_value ?? '').includes(url)) {
      usages.push({ label: `Setting: ${s.setting_key}`, href: '/dashboard/admin/settings' })
    }
  }
  return usages
}

export async function getAssetUsage(assetId: string): Promise<Result<{ usages: AssetUsage[] }>> {
  try {
    const { tenantId } = await requireStaff()
    const supabase = await createClient()
    const { data: asset } = await supabase
      .from('tenant_assets')
      .select('bucket, path')
      .eq('asset_id', assetId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!asset) return { success: false, error: 'Asset not found' }
    return { success: true, usages: await findUsages(tenantId, asset.bucket, asset.path) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to check usage' }
  }
}

/**
 * Deletes the file from storage (the storage trigger drops the row). Admins
 * can delete anything in the school; teachers only what they uploaded.
 */
export async function deleteTenantAsset(assetId: string): Promise<Result<object>> {
  try {
    const { role, tenantId } = await requireStaff()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: asset } = await supabase
      .from('tenant_assets')
      .select('asset_id, bucket, path, uploaded_by')
      .eq('asset_id', assetId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!asset) return { success: false, error: 'Asset not found' }
    if (role !== 'admin' && asset.uploaded_by !== user?.id) {
      return { success: false, error: 'Only an admin can delete files uploaded by others' }
    }
    if (!asset.path.startsWith(`${tenantId}/`)) return { success: false, error: 'Access denied' }

    const admin = createAdminClient()
    const { error } = await admin.storage.from(asset.bucket).remove([asset.path])
    if (error) throw error
    await admin.from('tenant_assets').delete().eq('asset_id', assetId).eq('tenant_id', tenantId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete asset' }
  }
}
