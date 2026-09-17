import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getCurrentTenant, type Tenant } from '@/lib/supabase/tenant'
import { normalizeLogoUrl } from '@/lib/themes/brand-outputs'

const FALLBACK_SITE_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'LMS Platform'

/**
 * Platform favicon, served from `public/` as plain static files (issue #778).
 * They used to live under `app/` (favicon.ico + icon.svg), Next's file-based
 * icon convention — but that convention *always* injects its own `<link
 * rel="icon">` tags in addition to whatever `generateMetadata` returns, so a
 * school's `favicon_url` rendered alongside the platform icon instead of
 * replacing it. Moving the files to `public/` keeps them reachable at the
 * same URLs while putting `icons` in full control of the tag(s) rendered.
 */
const PLATFORM_FAVICON_ICONS: NonNullable<Metadata['icons']> = [
  { url: '/icon.svg', type: 'image/svg+xml' },
  { url: '/favicon.ico', sizes: 'any' },
]

/**
 * Resolves the `<link rel="icon">` metadata for the current tenant: the
 * school's `tenant_settings.favicon_url` when it is a valid http(s) URL
 * (reusing the same guard emails/certificates trust, since this is free text
 * an admin typed), otherwise the platform's own icon files.
 */
export function resolveFaviconIcons(faviconUrlSetting: unknown): NonNullable<Metadata['icons']> {
  const normalized = normalizeLogoUrl(faviconUrlSetting)
  return normalized ? [{ url: normalized }] : PLATFORM_FAVICON_ICONS
}

/**
 * Absolute base URL of the current request (tenant subdomain aware).
 * Reads forwarded headers set by the reverse proxy; falls back to env.
 */
export async function getRequestBaseUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const isLocal = host.includes('localhost') || host.includes('lvh.me') || host.includes('127.0.0.1')
  const proto = h.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https')
  return `${proto}://${host}`
}

export interface SeoContext {
  baseUrl: string
  siteName: string
  tenant: Tenant | null
}

export async function getSeoContext(): Promise<SeoContext> {
  const [baseUrl, tenant] = await Promise.all([getRequestBaseUrl(), getCurrentTenant()])
  return {
    baseUrl,
    siteName: tenant?.name || FALLBACK_SITE_NAME,
    tenant,
  }
}

/** Relative URL of the dynamic OG image endpoint. Empty params are dropped. */
export function ogImageUrl(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value))
  }
  return `/api/og?${sp.toString()}`
}

interface PageMetaInput {
  /** Page title WITHOUT the site-name suffix (the root template appends it). */
  title: string
  description?: string
  /** Locale-less path for canonical/alternates, e.g. `/courses/12`. */
  path?: string
  locale?: string
  /** Absolute or root-relative OG image. Defaults to the generated /api/og card. */
  image?: string
  /** Uppercase pill label rendered on the generated OG card (ignored if `image` is set). */
  ogBadge?: string
  /** Extra query params merged into the generated /api/og card, e.g. `{ type: 'course', courseId }` (ignored if `image` is set). */
  ogParams?: Record<string, string | number | null | undefined>
  noIndex?: boolean
  ogType?: 'website' | 'article' | 'profile'
}

/**
 * Builds consistent Metadata for a public page: title/description,
 * canonical + hreflang alternates, Open Graph and Twitter cards.
 * metadataBase is set in the root layout, so relative URLs resolve there.
 */
export async function buildPageMetadata(input: PageMetaInput): Promise<Metadata> {
  const { siteName } = await getSeoContext()
  const description = input.description
  const image =
    input.image ??
    ogImageUrl({
      title: input.title,
      subtitle: description,
      site: siteName,
      badge: input.ogBadge,
      ...input.ogParams,
    })

  const metadata: Metadata = {
    title: input.title,
    description,
    openGraph: {
      title: input.title,
      description,
      siteName,
      type: input.ogType ?? 'website',
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description,
      images: [image],
    },
  }

  if (input.path && input.locale) {
    metadata.alternates = {
      canonical: `/${input.locale}${input.path === '/' ? '' : input.path}`,
      languages: {
        en: `/en${input.path === '/' ? '' : input.path}`,
        es: `/es${input.path === '/' ? '' : input.path}`,
      },
    }
  }

  if (input.noIndex) {
    metadata.robots = { index: false, follow: false }
  }

  return metadata
}
