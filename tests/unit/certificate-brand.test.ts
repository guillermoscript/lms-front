import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CERTIFICATE_DESIGN,
  resolveCertificateDesign,
} from '@/lib/certificates/default-design'
import { deriveBrandOutputs, PLATFORM_BRAND_HEX } from '@/lib/themes/brand-outputs'
import { generateCertificateHTML } from '@/lib/certificate-generator'
import type { StoredKitTheme } from '@/lib/themes/kit'

/**
 * Unit tests for `resolveCertificateDesign` (issue #765): the default
 * certificate design carries the school brand; a customised template's
 * colours pass through unchanged.
 */

const KODIGO_THEME: StoredKitTheme = { type: 'kit', theme: 'kodigo', brand: '#F2B705' }
const kodigoBrand = deriveBrandOutputs(KODIGO_THEME)
const platformBrand = deriveBrandOutputs(null)

describe('resolveCertificateDesign — school-branded defaults', () => {
  it('renders the school brand when there is no template at all', () => {
    const design = resolveCertificateDesign(null, kodigoBrand)
    expect(design.schoolBranded).toBe(true)
    expect(design.primary).toBe(kodigoBrand.brand)
    expect(design.secondary).toBe(kodigoBrand.deep)
    expect(design.accentText).toBe(kodigoBrand.brandText)
    expect(design.headingFont).toBe(kodigoBrand.headingFont)
  })

  it('renders the school brand when design_settings is undefined', () => {
    const design = resolveCertificateDesign(undefined, kodigoBrand)
    expect(design.schoolBranded).toBe(true)
  })

  it('renders the school brand when both colours still match the platform default', () => {
    const design = resolveCertificateDesign(
      { primary_color: DEFAULT_CERTIFICATE_DESIGN.primary_color, secondary_color: DEFAULT_CERTIFICATE_DESIGN.secondary_color },
      kodigoBrand
    )
    expect(design.schoolBranded).toBe(true)
    expect(design.primary).toBe(kodigoBrand.brand)
  })

  it('matches the default case-insensitively', () => {
    const design = resolveCertificateDesign(
      {
        primary_color: DEFAULT_CERTIFICATE_DESIGN.primary_color.toLowerCase(),
        secondary_color: DEFAULT_CERTIFICATE_DESIGN.secondary_color.toLowerCase(),
      },
      kodigoBrand
    )
    expect(design.schoolBranded).toBe(true)
  })

  it('a logo or signature alone does not make the colours custom', () => {
    // resolveCertificateDesign only ever receives the two colour fields — a
    // template's logo_url/signature_image_url live outside design_settings,
    // so they can never flip schoolBranded on their own.
    const design = resolveCertificateDesign(
      { primary_color: DEFAULT_CERTIFICATE_DESIGN.primary_color, secondary_color: DEFAULT_CERTIFICATE_DESIGN.secondary_color },
      kodigoBrand
    )
    expect(design.schoolBranded).toBe(true)
  })

  it('falls back to the platform palette when the tenant has no theme', () => {
    const design = resolveCertificateDesign(null, platformBrand)
    expect(design.schoolBranded).toBe(true)
    expect(design.primary).toBe(PLATFORM_BRAND_HEX)
    expect(design.headingFont).toBeNull()
  })
})

describe('resolveCertificateDesign — customised templates are unchanged', () => {
  it('keeps the template’s own primary/secondary exactly as stored', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: '#5B21B6' },
      kodigoBrand
    )
    expect(design.schoolBranded).toBe(false)
    expect(design.primary).toBe('#8B5CF6')
    expect(design.secondary).toBe('#5B21B6')
    expect(design.headingFont).toBeNull()
  })

  it('accentText mirrors primary for a custom design (unchanged rendering)', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: '#5B21B6' },
      kodigoBrand
    )
    expect(design.accentText).toBe(design.primary)
  })

  it('is custom when only the primary colour was changed', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: DEFAULT_CERTIFICATE_DESIGN.secondary_color },
      kodigoBrand
    )
    expect(design.schoolBranded).toBe(false)
    expect(design.primary).toBe('#8B5CF6')
    expect(design.secondary).toBe(DEFAULT_CERTIFICATE_DESIGN.secondary_color)
  })

  it('is custom when only the secondary colour was changed', () => {
    const design = resolveCertificateDesign(
      { primary_color: DEFAULT_CERTIFICATE_DESIGN.primary_color, secondary_color: '#5B21B6' },
      kodigoBrand
    )
    expect(design.schoolBranded).toBe(false)
    expect(design.secondary).toBe('#5B21B6')
  })

  it('never touches the school brand for a custom design', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: '#5B21B6' },
      kodigoBrand
    )
    expect(design.primary).not.toBe(kodigoBrand.brand)
    expect(design.accentText).not.toBe(kodigoBrand.brandText)
  })
})

describe('resolveCertificateDesign — rejects a non-hex colour', () => {
  // A template's design_settings is spliced raw into a <style> block served
  // on the public, unauthenticated certificate view — a value that isn't a
  // plain #RRGGBB (e.g. a </style> breakout) must never reach a renderer.
  it('falls back to the platform default on a CSS/HTML-breakout payload', () => {
    const design = resolveCertificateDesign(
      { primary_color: 'red}</style><script>alert(1)</script><style>x{color:red', secondary_color: '#5B21B6' },
      kodigoBrand
    )
    expect(design.primary).toBe(DEFAULT_CERTIFICATE_DESIGN.primary_color)
    expect(design.accentText).toBe(DEFAULT_CERTIFICATE_DESIGN.primary_color)
  })

  it('falls back to the platform default on a malformed hex (too short, no #)', () => {
    const design = resolveCertificateDesign(
      { primary_color: 'ABC', secondary_color: '#12345' },
      kodigoBrand
    )
    expect(design.primary).toBe(DEFAULT_CERTIFICATE_DESIGN.primary_color)
    expect(design.secondary).toBe(DEFAULT_CERTIFICATE_DESIGN.secondary_color)
  })

  it('keeps a well-formed custom hex untouched', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8b5cf6', secondary_color: '#5B21B6' },
      kodigoBrand
    )
    expect(design.primary).toBe('#8b5cf6')
    expect(design.secondary).toBe('#5B21B6')
  })
})

describe('generateCertificateHTML — brand carries through to the markup', () => {
  const baseData = {
    certificateNumber: 'VERIFY-TEST-1',
    studentName: 'Jane Doe',
    courseTitle: 'Web Development Basics',
    completionDate: new Date('2026-06-15T12:00:00.000Z'),
    issuerName: 'Kódigo Academy',
  }

  it('a school-branded certificate carries the brand hex and a @font-face for its heading font', () => {
    const design = resolveCertificateDesign(null, kodigoBrand)
    const html = generateCertificateHTML({ ...baseData, design })

    expect(html).toContain(kodigoBrand.brand)
    expect(html).toContain(kodigoBrand.brandText)
    expect(html).toContain('@font-face')
    expect(html).toContain(`Kit ${kodigoBrand.headingFont}`)
    expect(html).not.toContain('#1a5632')
  })

  it('a custom template keeps its own colours, Cormorant Garamond, and no @font-face', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: '#5B21B6' },
      kodigoBrand
    )
    const html = generateCertificateHTML({ ...baseData, design })

    expect(html).toContain('#8B5CF6')
    expect(html).toContain('#5B21B6')
    expect(html).toContain('Cormorant Garamond')
    expect(html).not.toContain('@font-face')
    expect(html).not.toContain(kodigoBrand.brand)
  })

  it('a tenant with no theme falls back to the platform palette and today’s font', () => {
    const design = resolveCertificateDesign(null, platformBrand)
    const html = generateCertificateHTML({ ...baseData, design })

    expect(html).toContain(PLATFORM_BRAND_HEX)
    expect(html).toContain('Cormorant Garamond')
    expect(html).not.toContain('@font-face')
  })
})
