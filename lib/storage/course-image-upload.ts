import { nanoid } from 'nanoid'

import { createClient } from '@/lib/supabase/client'

const BUCKET = 'course-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB, same as the bucket's file_size_limit
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/**
 * Uploads a course/lesson image from the browser straight to the public
 * `course-images` bucket, under the school's folder, and returns its public URL.
 *
 * The bytes never pass through the app server, so the CDN/WAF in front of it
 * and the 1MB Server Action body limit don't apply. The storage INSERT policy
 * (`is_staff_of` the folder's school) is the auth gate, and the bucket enforces
 * the size and mime-type limits; the storage trigger records the uploader.
 */
export async function uploadCourseImage(
  file: File,
  tenantId: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'File size must be under 5MB' }
  }
  const ext = EXTENSIONS[file.type]
  if (!ext) {
    return { success: false, error: 'File type not allowed. Use JPEG, PNG, GIF, or WebP.' }
  }

  const path = `${tenantId}/${nanoid()}.${ext}`
  const bucket = createClient().storage.from(BUCKET)
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false })
  if (error) return { success: false, error: error.message }

  return { success: true, url: bucket.getPublicUrl(path).data.publicUrl }
}
