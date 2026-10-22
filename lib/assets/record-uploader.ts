import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUserId } from '@/lib/supabase/tenant'

/**
 * Server actions upload with the service role, so storage records no owner.
 * Stamp the caller on the asset row (created by the storage trigger inside
 * the upload) so the library can say who uploaded it. Best effort: never
 * fails the upload.
 */
export async function recordAssetUploader(bucket: string, path: string, userId?: string | null) {
  try {
    const uploader = userId ?? (await getCurrentUserId())
    if (!uploader) return
    await createAdminClient()
      .from('tenant_assets')
      .update({ uploaded_by: uploader })
      .eq('bucket', bucket)
      .eq('path', path)
      .is('uploaded_by', null)
  } catch {
    /* attribution is a convenience */
  }
}
