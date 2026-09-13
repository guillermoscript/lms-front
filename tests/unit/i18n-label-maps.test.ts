import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import { TEMPLATE_MESSAGE_KEYS, templateMessageKey } from '@/lib/puck/template-labels'
import {
  systemTemplateMessageKey,
  templateCategoryMessageKey,
} from '@/lib/prompt-template-labels'

/**
 * #726 translates three kinds of English-in-the-database text — landing
 * template names, the seeded prompt templates, and prompt categories — by
 * mapping the stored value onto a message key. A key that exists in the map but
 * not in both catalogs renders as a raw key path on screen, which is worse than
 * the English it replaced, so these cases check the two sides agree.
 */
function at(catalog: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    catalog
  )
}

describe('landing template labels', () => {
  it('maps the names the template data actually uses', () => {
    expect(templateMessageKey('Modern Academy')).toBe('modernAcademy')
    expect(templateMessageKey('  Blank  ')).toBe('blank')
    expect(templateMessageKey('Language School — FAQ')).toBe('languageSchoolFaq')
  })

  it('leaves an unknown template name alone', () => {
    expect(templateMessageKey('My Own Template')).toBeNull()
    expect(templateMessageKey(null)).toBeNull()
  })

  it('has a name and a description in both catalogs for every key', () => {
    for (const key of TEMPLATE_MESSAGE_KEYS) {
      for (const [label, catalog] of [['en', en], ['es', es]] as const) {
        expect(at(catalog, `landingPageBuilder.templates.${key}.name`), `${label}:${key}.name`).toBeTruthy()
        expect(at(catalog, `landingPageBuilder.templates.${key}.description`), `${label}:${key}.description`).toBeTruthy()
      }
    }
  })
})

describe('prompt template labels', () => {
  it('maps the six seeded system templates', () => {
    const seeded = [
      'Conversation Practice',
      'Comprehension Check',
      'Writing Practice',
      'Code Review Assistant',
      'Essay Evaluation',
      'Critical Thinking Grader',
    ]
    for (const name of seeded) {
      const key = systemTemplateMessageKey(name)
      expect(key, name).not.toBeNull()
      for (const catalog of [en, es]) {
        expect(at(catalog, `dashboard.teacher.templates.system.${key}.name`)).toBeTruthy()
        expect(at(catalog, `dashboard.teacher.templates.system.${key}.description`)).toBeTruthy()
      }
    }
  })

  it("leaves a teacher's own template alone", () => {
    expect(systemTemplateMessageKey('Mi plantilla')).toBeNull()
  })

  it('maps every category the seed writes', () => {
    for (const category of ['lesson_task', 'exercise', 'exam_grading']) {
      const key = templateCategoryMessageKey(category)
      expect(key, category).not.toBeNull()
      for (const catalog of [en, es]) {
        expect(at(catalog, `dashboard.teacher.templates.categories.${key}`)).toBeTruthy()
      }
    }
    expect(templateCategoryMessageKey('something_else')).toBeNull()
  })
})
