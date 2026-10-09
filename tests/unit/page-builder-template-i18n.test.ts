import { describe, expect, it } from 'vitest'
import {
  PAGE_BUILDER_MANIFEST,
  PAGE_TEMPLATES,
  allItems,
  collectTemplateCopy,
  instantiateTemplate,
  isCopyKey,
  localizeDefaults,
  localizeTemplateCopy,
  pageCatalog,
  presetToOps,
  templateToOps,
  translateTemplateString,
  type ManifestField,
} from '@lms/core'
import { TEMPLATE_COPY_ES } from '@lms/core/src/page-builder/template-copy-es'
import { createPuckConfig } from '@/lib/puck/config'

const TOKEN = /\{\{\s*\w+\s*\}\}/g

describe('template copy in Spanish', () => {
  it('has a Spanish entry for every copy string of every template, name and description', () => {
    const missing = new Set<string>()
    for (const t of PAGE_TEMPLATES) {
      for (const s of [t.name, t.description, ...collectTemplateCopy(t.puck_data)]) {
        if (!(s in TEMPLATE_COPY_ES)) missing.add(s)
      }
    }
    expect([...missing]).toEqual([])
  })

  it('has a Spanish entry for every copy string in every block default (defaultProps and array-item defaults)', () => {
    const missing = new Set<string>()
    const itemDefaults = (fields: Record<string, ManifestField> | undefined, out: unknown[]) => {
      for (const field of Object.values(fields ?? {})) {
        if (field.defaultItemProps) out.push(field.defaultItemProps)
        itemDefaults(field.arrayFields, out)
      }
    }
    for (const entry of Object.values(PAGE_BUILDER_MANIFEST.components)) {
      const defaults: unknown[] = [entry.defaultProps]
      itemDefaults(entry.fields, defaults)
      for (const value of defaults) {
        for (const s of collectTemplateCopy(value)) if (!(s in TEMPLATE_COPY_ES)) missing.add(s)
      }
    }
    expect([...missing]).toEqual([])
  })

  it('fills the defaults of a block added on a Spanish page in Spanish, links and enums untouched', () => {
    const es = localizeDefaults(pageCatalog, 'es')
    const header = es.defaultProps('Header') as { navLinks: Array<{ label: string; href: string }>; ctaLabel: string }
    expect(header.navLinks[0]).toEqual({ label: 'Cursos', href: '/courses' })
    expect(header.ctaLabel).toBe('Inscríbete ahora')
    expect(es.defaultProps('CtaBlock').style).toBe(pageCatalog.defaultProps('CtaBlock').style)
    expect(localizeDefaults(pageCatalog, 'en')).toBe(pageCatalog)
    // The rest of the catalog is the same one.
    expect(es.validateBlock('CtaBlock', { title: 'Hola' })).toEqual(pageCatalog.validateBlock('CtaBlock', { title: 'Hola' }))
  })

  it("gives a Spanish page's editor Spanish block and array-item defaults", () => {
    const t = Object.assign((key: string) => key, { has: () => false })
    type HeaderDefaults = { ctaLabel: string; navLinks: Array<{ label: string; href: string }> }
    const es = createPuckConfig(t, 'es')
    const header = es.components.Header.defaultProps as HeaderDefaults
    expect(header.ctaLabel).toBe('Inscríbete ahora')
    expect(header.navLinks[0]).toEqual({ label: 'Cursos', href: '/courses' })
    const items = (es.components.FeaturesGrid.fields as Record<string, { defaultItemProps?: Record<string, unknown> }>).items
    expect(items.defaultItemProps).toEqual({ icon: '⭐', title: 'Característica', description: 'Descripción' })
    expect((createPuckConfig(t).components.Header.defaultProps as HeaderDefaults).ctaLabel).toBe('Enroll Now')
  })

  it('keeps every binding token of the source string', () => {
    for (const [en, es] of Object.entries(TEMPLATE_COPY_ES)) {
      expect((es.match(TOKEN) ?? []).sort(), en).toEqual((en.match(TOKEN) ?? []).sort())
    }
  })

  it('never treats a select/radio field as copy (its value is an enum token)', () => {
    const enumKeys = new Set<string>()
    const visit = (fields: Record<string, ManifestField> | undefined) => {
      for (const [key, field] of Object.entries(fields ?? {})) {
        if (field.type === 'select' || field.type === 'radio') enumKeys.add(key)
        visit(field.arrayFields)
      }
    }
    for (const entry of Object.values(PAGE_BUILDER_MANIFEST.components)) visit(entry.fields)
    expect([...enumKeys].filter(isCopyKey)).toEqual([])
  })

  it('instantiates a template in Spanish, translating before substituting tokens', () => {
    const page = instantiateTemplate('school-home', { bindings: { schoolName: 'Academia Sol', year: '2026', locale: 'es' } })
    const json = JSON.stringify(page)
    expect(json).toContain('Domina nuevas habilidades y transforma tu carrera')
    expect(json).toContain('© 2026 Academia Sol. Todos los derechos reservados.')
    expect(json).not.toContain('Master New Skills')
    // Links and layout tokens are untouched.
    const header = allItems(page).find((n) => n.item.type === 'Header')!.item
    expect((header.props.navLinks as Array<{ href: string }>)[0].href).toBe('/courses')
    const cta = allItems(page).find((n) => n.item.type === 'CtaBlock')!.item
    expect(cta.props.style).toBe('gradient')
  })

  it('leaves English templates as written', () => {
    const page = instantiateTemplate('school-home', { bindings: { locale: 'en' } })
    expect(JSON.stringify(page)).toContain('Master New Skills, Transform Your Career')
  })

  it('localizes the ops the AI streams (apply_template, insert_preset)', () => {
    const ops = templateToOps('course-landing', { bindings: { courseId: '7', locale: 'es' } })
    expect(JSON.stringify(ops)).not.toMatch(/"title":"Curriculum"/)
    const preset = presetToOps('faq-cta', { index: 0 }, { bindings: { locale: 'es' } })
    expect(JSON.stringify(preset)).toContain('Preguntas frecuentes')
  })

  it('translates single strings and leaves unknown ones alone', () => {
    expect(translateTemplateString('Courses', 'es')).toBe('Cursos')
    expect(translateTemplateString('Not a template string', 'es')).toBe('Not a template string')
    expect(localizeTemplateCopy({ href: 'Courses', label: 'Courses' }, 'es')).toEqual({ href: 'Courses', label: 'Cursos' })
  })
})
