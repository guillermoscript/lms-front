'use client'

import { IconAlertTriangle } from '@tabler/icons-react'

/**
 * Supabase signed storage URLs (/storage/v1/object/sign/...) expire — pasted
 * into lesson content they break for every reader once the token lapses,
 * which surfaces as image/file 404s (issue #426 QA follow-up).
 */
export function isExpiringSignedUrl(url: string): boolean {
  return url.includes('/storage/v1/object/sign/')
}

export function ExpiringUrlWarning({ url, hint }: { url: string; hint: string }) {
  if (!isExpiringSignedUrl(url)) return null
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
      <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>Esta URL firmada caduca (~1 hora) y dejará de funcionar para los estudiantes. {hint}</span>
    </p>
  )
}
