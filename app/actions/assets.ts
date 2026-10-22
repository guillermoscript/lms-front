'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { errorMessage } from '@/lib/supabase/error-message'

export type AssetKind = 'image' | 'video' | 'document' | 'other'
export type AssetSource =
  | 'course'
  | 'landing_page'
  | 'certificate'
  | 'community'
  | 'ai_generated'
  | 'library'
  | 'other'

export type AssetUsageType =
  | 'course'
  | 'lesson'
  | 'certificate'
  | 'landing_page'
  | 'setting'
  | 'school_logo'
  | 'community_post'

export interface AssetUsage {
  type: AssetUsageType
  name: string
  href: string | null
}

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
  uploadedBy: { id: string; name: string } | null
  /** Live: computed from the school's content every time the library loads. */
  usages: AssetUsage[]
}

type Result<T> = ({ success: true } & T) | { success: false; error: string }

const PAGE_SIZE = 48
const UNUSED_SCAN_LIMIT = 2000

async function requireStaff() {
  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') throw new Error('Unauthorized')
  return { role, tenantId: await getCurrentTenantId() }
}

interface UsageEntry extends AssetUsage {
  haystack: string
}

/**
 * Everything in the school that can embed an uploaded file, as searchable
 * text. Built once per request and matched against each asset's
 * `bucket/path`, so usage is always current — nothing to keep in sync.
 */
async function buildUsageIndex(tenantId: string): Promise<UsageEntry[]> {
  const admin = createAdminClient()
  const [courses, lessons, templates, pages, settings, tenant, posts] = await Promise.all([
    admin.from('courses').select('course_id, title, thumbnail_url').eq('tenant_id', tenantId).limit(2000),
    admin
      .from('lessons')
      .select('id, course_id, title, image, video_url, content')
      .eq('tenant_id', tenantId)
      .limit(5000),
    admin
      .from('certificate_templates')
      .select('template_name, course_id, logo_url, signature_image_url')
      .eq('tenant_id', tenantId),
    admin.from('landing_pages').select('title, puck_data').eq('tenant_id', tenantId),
    admin.from('tenant_settings').select('setting_key, setting_value').eq('tenant_id', tenantId),
    admin.from('tenants').select('logo_url').eq('id', tenantId).maybeSingle(),
    admin
      .from('community_posts')
      .select('title, content, media_urls')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(2000),
  ])

  const index: UsageEntry[] = []
  for (const c of courses.data ?? []) {
    index.push({
      type: 'course',
      name: c.title,
      href: `/dashboard/teacher/courses/${c.course_id}`,
      haystack: c.thumbnail_url ?? '',
    })
  }
  for (const l of lessons.data ?? []) {
    index.push({
      type: 'lesson',
      name: l.title ?? '',
      href: l.course_id ? `/dashboard/teacher/courses/${l.course_id}/lessons/${l.id}` : null,
      haystack: `${l.image ?? ''} ${l.video_url ?? ''} ${l.content ?? ''}`,
    })
  }
  for (const t of templates.data ?? []) {
    index.push({
      type: 'certificate',
      name: t.template_name,
      href: t.course_id ? `/dashboard/teacher/courses/${t.course_id}/certificates` : null,
      haystack: `${t.logo_url ?? ''} ${t.signature_image_url ?? ''}`,
    })
  }
  for (const p of pages.data ?? []) {
    index.push({
      type: 'landing_page',
      name: p.title,
      href: '/dashboard/admin/landing-page',
      haystack: JSON.stringify(p.puck_data ?? {}),
    })
  }
  for (const st of settings.data ?? []) {
    index.push({
      type: 'setting',
      name: st.setting_key,
      href: '/dashboard/admin/appearance',
      haystack: JSON.stringify(st.setting_value ?? ''),
    })
  }
  if (tenant.data?.logo_url) {
    index.push({
      type: 'school_logo',
      name: '',
      href: '/dashboard/admin/appearance',
      haystack: tenant.data.logo_url,
    })
  }
  for (const post of posts.data ?? []) {
    index.push({
      type: 'community_post',
      name: post.title ?? '',
      href: '/dashboard/admin/community',
      haystack: `${post.content} ${JSON.stringify(post.media_urls ?? [])}`,
    })
  }
  return index
}

function usagesOf(index: UsageEntry[], bucket: string, path: string): AssetUsage[] {
  const needle = `${bucket}/${path}`
  return index
    .filter((e) => e.haystack.includes(needle))
    .map(({ type, name, href }) => ({ type, name, href }))
}

/**
 * The school's asset library, newest first, with who uploaded each file and
 * where it is used. Reads through RLS (`is_staff_of(tenant_id)`) with the
 * tenant filter on top.
 */
export async function listTenantAssets(opts: {
  kind?: AssetKind
  source?: AssetSource
  search?: string
  /** `unused`: only files nothing in the school references. */
  usage?: 'unused'
  page?: number
}): Promise<Result<{ assets: TenantAsset[]; total: number; pageSize: number; usedBytes: number }>> {
  try {
    const { tenantId } = await requireStaff()
    const supabase = await createClient()
    const page = Math.max(0, opts.page ?? 0)
    const unusedOnly = opts.usage === 'unused'

    let query = supabase
      .from('tenant_assets')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    query = unusedOnly
      ? query.range(0, UNUSED_SCAN_LIMIT - 1)
      : query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (opts.kind) query = query.eq('kind', opts.kind)
    if (opts.source) query = query.eq('source', opts.source)
    const search = opts.search?.trim().replace(/[%_,()]/g, '')
    if (search) query = query.ilike('name', `%${search}%`)

    const [{ data, error, count }, { data: sizes }, index] = await Promise.all([
      query,
      // Storage used by the whole school (not just this page / filter).
      supabase.from('tenant_assets').select('size_bytes').eq('tenant_id', tenantId).limit(10000),
      buildUsageIndex(tenantId),
    ])
    if (error) throw error
    const usedBytes = (sizes ?? []).reduce((sum, r) => sum + (r.size_bytes ?? 0), 0)

    let rows = (data ?? []).map((r) => ({ row: r, usages: usagesOf(index, r.bucket, r.path) }))
    let total = count ?? rows.length
    if (unusedOnly) {
      rows = rows.filter((r) => r.usages.length === 0)
      total = rows.length
      rows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    }

    const uploaderIds = [...new Set(rows.map((r) => r.row.uploaded_by).filter((id): id is string => !!id))]
    const admin = createAdminClient()
    const names = new Map<string, string>()
    if (uploaderIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, username')
        .in('id', uploaderIds)
      for (const p of profiles ?? []) names.set(p.id, p.full_name || p.username || '')
    }

    const assets = rows.map(({ row: r, usages }): TenantAsset => ({
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
      uploadedBy: r.uploaded_by ? { id: r.uploaded_by, name: names.get(r.uploaded_by) ?? '' } : null,
      usages,
    }))

    return { success: true, assets, total, pageSize: PAGE_SIZE, usedBytes }
  } catch (err) {
    console.error('[assets] listTenantAssets failed:', err)
    return { success: false, error: errorMessage(err, 'Failed to list assets') }
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

    const { data: asset, error: lookupError } = await supabase
      .from('tenant_assets')
      .select('asset_id, bucket, path, uploaded_by')
      .eq('asset_id', assetId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (lookupError) throw lookupError
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
    console.error('[assets] deleteTenantAsset failed:', err)
    return { success: false, error: errorMessage(err, 'Failed to delete asset') }
  }
}
