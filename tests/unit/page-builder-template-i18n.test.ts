import { describe, expect, it } from 'vitest'
import {
  PAGE_BUILDER_MANIFEST,
  PAGE_TEMPLATES,
  allItems,
  collectTemplateCopy,
  instantiateTemplate,
  isCopyKey,
  localizeTemplateCopy,
  presetToOps,
  templateToOps,
  translateTemplateString,
  type ManifestField,
} from '@lms/core'
import { TEMPLATE_COPY_ES } from '@lms/core/src/page-builder/template-copy-es'

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
