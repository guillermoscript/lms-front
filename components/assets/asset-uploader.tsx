'use client'

import { useEffect, useRef } from 'react'

import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone'
import { useSupabaseUpload } from '@/hooks/use-supabase-upload'
import { useTenant } from '@/components/tenant/tenant-provider'

export const LIBRARY_BUCKET = 'landing-page-assets'
const MAX_SIZE = 5 * 1024 * 1024

interface AssetUploaderProps {
  /** Receives the storage paths (inside LIBRARY_BUCKET) of the files just uploaded. */
  onUploaded: (paths: string[]) => void
  maxFiles?: number
}

/**
 * Browser-to-Supabase upload into the school's library folder. The storage
 * trigger records every object in `tenant_assets`, so nothing else has to be
 * called after the upload.
 */
export function AssetUploader({ onUploaded, maxFiles = 10 }: AssetUploaderProps) {
  const tenant = useTenant()
  const resetRef = useRef<() => void>(() => {})

  const upload = useSupabaseUpload({
    bucketName: LIBRARY_BUCKET,
    path: `${tenant?.id}/library`,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    maxFileSize: MAX_SIZE,
    maxFiles,
    cacheControl: 31536000,
    onUploaded: (paths) => {
      onUploaded(paths)
      // Let the success state show briefly, then accept the next batch.
      setTimeout(() => resetRef.current(), 1200)
    },
  })
  const { reset } = upload
  useEffect(() => {
    resetRef.current = reset
  }, [reset])

  if (!tenant?.id) return null

  return (
    <Dropzone {...upload}>
      <DropzoneEmptyState />
      <DropzoneContent />
    </Dropzone>
  )
}
