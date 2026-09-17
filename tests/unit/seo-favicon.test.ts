import { describe, it, expect } from 'vitest'
import { resolveFaviconIcons } from '@/lib/seo'

/**
 * Unit tests for `resolveFaviconIcons` (issue #778): the icon-selection
 * helper `generateMetadata` in `app/[locale]/layout.tsx` uses to pick between
 * a school's `tenant_settings.favicon_url` and the platform's own icon files.
 */
describe('resolveFaviconIcons', () => {
  it('uses the school favicon when favicon_url is a valid https URL', () => {
    expect(resolveFaviconIcons('https://cdn.example.com/school-favicon.png')).toEqual([
      { url: 'https://cdn.example.com/school-favicon.png' },
    ])
  })

  it('uses the school favicon when favicon_url is a valid http URL', () => {
    expect(resolveFaviconIcons('http://cdn.example.com/school-favicon.png')).toEqual([
      { url: 'http://cdn.example.com/school-favicon.png' },
    ])
  })

  it('falls back to the platform icons when favicon_url is undefined', () => {
    const icons = resolveFaviconIcons(undefined)
    expect(icons).toEqual([
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ])
  })

  it('falls back to the platform icons for an empty string', () => {
    expect(resolveFaviconIcons('')).toEqual([
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ])
  })

  it('falls back to the platform icons for a javascript: URL', () => {
    expect(resolveFaviconIcons('javascript:alert(1)')).toEqual([
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ])
  })

  it('falls back to the platform icons for a relative path (never trusted as absolute)', () => {
    expect(resolveFaviconIcons('/uploads/favicon.png')).toEqual([
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ])
  })

  it('falls back to the platform icons for a non-string value', () => {
    expect(resolveFaviconIcons(42)).toEqual([
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ])
  })
})
