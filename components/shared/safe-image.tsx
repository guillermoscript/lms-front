'use client'

import * as React from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type SafeImageProps = React.ComponentProps<'img'>

/**
 * Plain <img> for user-supplied URLs (community posts, lesson MDX, vocabulary).
 * Lazy-loads, reserves a muted background while loading, and swaps a broken
 * image for a neutral placeholder instead of the browser's broken-image icon.
 */
export function SafeImage({ className, alt, onError, onLoad, ...props }: SafeImageProps) {
  const src = typeof props.src === 'string' ? props.src : undefined
  // Keyed by src so a changed URL gets a fresh attempt without an effect.
  const [failedSrc, setFailedSrc] = React.useState<string>()
  const [loadedSrc, setLoadedSrc] = React.useState<string>()
  const loaded = loadedSrc === src

  if (!src || failedSrc === src) {
    return (
      <span
        role="img"
        aria-label={alt || 'Image unavailable'}
        className={cn(
          'inline-flex items-center justify-center bg-muted text-muted-foreground min-h-16 min-w-16',
          className
        )}
      >
        <ImageOff className="size-5" aria-hidden />
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      className={cn(!loaded && 'bg-muted', className)}
      onLoad={(e) => {
        setLoadedSrc(src)
        onLoad?.(e)
      }}
      onError={(e) => {
        setFailedSrc(src)
        onError?.(e)
      }}
    />
  )
}
