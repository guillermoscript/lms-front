import { describe, it, expect } from 'vitest'
import { createStyles } from '@/lib/certificates/pdf-generator'
import { resolveCertificateDesign } from '@/lib/certificates/default-design'
import { deriveBrandOutputs } from '@/lib/themes/brand-outputs'
import type { StoredKitTheme } from '@/lib/themes/kit'

/**
 * Unit tests for `createStyles` (issue #765): before the fix, a custom
 * template's PDF ignored its own `primary_color` (camelCase/snake_case
 * mismatch) and always drew a hardcoded green. This pins that a custom
 * template's colours reach the actual PDF stylesheet, and that a
 * school-branded certificate keeps using the tenant's brand instead.
 */

const KODIGO_THEME: StoredKitTheme = { type: 'kit', theme: 'kodigo', brand: '#F2B705' }
const kodigoBrand = deriveBrandOutputs(KODIGO_THEME)

describe('createStyles — custom template colours reach the PDF', () => {
  it('a custom design paints frame/rule colours with its own primary, not a hardcoded default', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: '#111827' },
      kodigoBrand
    )
    const styles = createStyles(design, null)

    expect(styles.frameOuter.borderColor).toBe('#8B5CF640')
    expect(styles.topRule.backgroundColor).toBe('#8B5CF6')
    expect(styles.flourishLine.backgroundColor).toBe('#8B5CF6')
    // Never the school's brand and never the old hardcoded green (#22c55e).
    expect(styles.frameOuter.borderColor).not.toContain(kodigoBrand.brand)
    expect(styles.frameOuter.borderColor.toLowerCase()).not.toContain('22c55e')
  })

  it('a custom design splits small/big text between primary and secondary', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: '#111827' },
      kodigoBrand
    )
    const styles = createStyles(design, null)

    expect(styles.issuerName.color).toBe('#8B5CF6')
    expect(styles.title.color).toBe('#111827')
    expect(styles.studentName.color).toBe('#111827')
  })

  it('a school-branded design paints with the tenant brand, in one AA-safe accent text colour', () => {
    const design = resolveCertificateDesign(null, kodigoBrand)
    const styles = createStyles(design, null)

    expect(styles.frameOuter.borderColor).toBe(`${kodigoBrand.brand}40`)
    expect(styles.issuerName.color).toBe(kodigoBrand.brandText)
    expect(styles.title.color).toBe(kodigoBrand.brandText)
    expect(styles.studentName.color).toBe(kodigoBrand.brandText)
  })

  it('uses the kit heading font family for a school-branded title when one is registered', () => {
    const design = resolveCertificateDesign(null, kodigoBrand)
    const pdfFamily = `Kit ${design.headingFont}`
    const styles = createStyles(design, pdfFamily)

    expect(styles.title.fontFamily).toBe(pdfFamily)
    expect(styles.title.fontStyle).toBeUndefined()
  })

  it('falls back to italic Helvetica for a custom design (no heading font)', () => {
    const design = resolveCertificateDesign(
      { primary_color: '#8B5CF6', secondary_color: '#111827' },
      kodigoBrand
    )
    const styles = createStyles(design, null)

    expect(design.headingFont).toBeNull()
    expect(styles.title.fontFamily).toBe('Helvetica')
    expect(styles.title.fontStyle).toBe('italic')
  })
})
