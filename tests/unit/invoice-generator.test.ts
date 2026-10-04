import { describe, it, expect } from 'vitest'
import { generateInvoiceHTML, getInvoiceConfig, type InvoiceData } from '@/lib/invoice-generator'
import { deriveBrandOutputs, PLATFORM_BRAND_HEX } from '@/lib/themes/brand-outputs'
import { platformSchoolBrand, type SchoolBrand } from '@/lib/themes/school-brand'
import type { StoredKitTheme } from '@/lib/themes/kit'

/**
 * Unit tests for issue #777: a student's invoice is issued by its own school
 * (name, logo, brand colour), never the platform / `process.env.COMPANY_*`.
 */

const KODIGO_THEME: StoredKitTheme = { type: 'kit', theme: 'kodigo', brand: '#F2B705' }

function kodigoSchoolBrand(overrides: Partial<SchoolBrand> = {}): SchoolBrand {
  return {
    tenantId: 'tenant-1',
    name: 'Kódigo Academy',
    logoUrl: 'https://cdn.example.com/kodigo-logo.png',
    theme: KODIGO_THEME,
    outputs: deriveBrandOutputs(KODIGO_THEME),
    ...overrides,
  }
}

function baseInvoiceData(overrides: Partial<InvoiceData> = {}): InvoiceData {
  const brand = kodigoSchoolBrand()
  return {
    invoiceNumber: 'INV-0001',
    invoiceDate: new Date('2026-09-17'),
    studentName: 'Ana Student',
    studentEmail: 'ana@example.com',
    productName: 'Intro to Web Dev',
    price: 49,
    currency: 'usd',
    issuer: getInvoiceConfig(brand),
    ...overrides,
  }
}

describe('getInvoiceConfig — resolves the issuer from the school brand, not env vars', () => {
  it('carries the school name, logo and literal brand hex outputs', () => {
    const brand = kodigoSchoolBrand()
    const issuer = getInvoiceConfig(brand)

    expect(issuer.name).toBe('Kódigo Academy')
    expect(issuer.logoUrl).toBe('https://cdn.example.com/kodigo-logo.png')
    expect(issuer.brand).toBe(brand.outputs.brand)
    expect(issuer.brandText).toBe(brand.outputs.brandText)
    expect(issuer.button).toBe(brand.outputs.button)
    expect(issuer.buttonInk).toBe(brand.outputs.buttonInk)
    expect(issuer.brand).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('falls back to tenants.name and the platform brand when there is no theme', () => {
    const brand = platformSchoolBrand('tenant-2', 'Untitled School')
    const issuer = getInvoiceConfig(brand)

    expect(issuer.name).toBe('Untitled School')
    expect(issuer.logoUrl).toBeNull()
    expect(issuer.brand).toBe(PLATFORM_BRAND_HEX)
  })

  it('falls back to a generic name when the tenant has none at all', () => {
    const brand = platformSchoolBrand('tenant-3', '')
    const issuer = getInvoiceConfig(brand)
    expect(issuer.name).toBe('School')
  })

  it('drops a non-http(s) logo URL rather than trusting it', () => {
    const brand = kodigoSchoolBrand({ logoUrl: 'javascript:alert(1)' })
    const issuer = getInvoiceConfig(brand)
    expect(issuer.logoUrl).toBeNull()
  })

  it('has no address/email/phone until a tenant_settings key exists for them', () => {
    const issuer = getInvoiceConfig(kodigoSchoolBrand())
    expect(issuer.address).toBeUndefined()
    expect(issuer.email).toBeUndefined()
    expect(issuer.phone).toBeUndefined()
  })
})

describe('generateInvoiceHTML — the school brand, not the platform', () => {
  it('renders the school name, logo and brand hex; never "LMS Platform"', () => {
    const brand = kodigoSchoolBrand()
    const html = generateInvoiceHTML(baseInvoiceData({ issuer: getInvoiceConfig(brand) }))

    expect(html).toContain('Kódigo Academy')
    expect(html).toContain('https://cdn.example.com/kodigo-logo.png')
    expect(html).toContain(brand.outputs.brand)
    expect(html).toContain(brand.outputs.brandText)
    expect(html).not.toContain('LMS Platform')
    expect(html).toContain('generated automatically by Kódigo Academy')
  })

  it('falls back to the platform palette for a school with no theme', () => {
    const brand = platformSchoolBrand('tenant-2', 'Plain School')
    const html = generateInvoiceHTML(baseInvoiceData({ issuer: getInvoiceConfig(brand) }))

    expect(html).toContain('Plain School')
    expect(html).toContain(PLATFORM_BRAND_HEX)
  })

  it('omits the logo <img> when the school has none', () => {
    const brand = kodigoSchoolBrand({ logoUrl: null })
    const html = generateInvoiceHTML(baseInvoiceData({ issuer: getInvoiceConfig(brand) }))
    expect(html).not.toContain('<img')
  })

  it('escapes a school name, product name and student name containing HTML', () => {
    const brand = kodigoSchoolBrand({ name: '<script>alert(1)</script> School' })
    const html = generateInvoiceHTML(
      baseInvoiceData({
        issuer: getInvoiceConfig(brand),
        studentName: '<b>Ana</b>',
        productName: 'Course "<XSS>"',
        productDescription: "It's <great> & fun",
        notes: '<img src=x onerror=alert(1)>',
        paymentInstructions: 'Line 1 <script>\nLine 2',
      })
    )

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<b>Ana</b>')
    expect(html).not.toContain('Course "<XSS>"')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;')
    expect(html).toContain('&quot;&lt;XSS&gt;&quot;')
    expect(html).toContain('It&#039;s &lt;great&gt; &amp; fun')
  })

  it('escapes invoice number, student email and payment method', () => {
    const html = generateInvoiceHTML(
      baseInvoiceData({
        invoiceNumber: 'INV-"><script>x</script>',
        studentEmail: 'ana@example.com',
        paymentMethod: '<b>bank</b>',
      })
    )
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).not.toContain('<b>bank</b>')
  })
})
