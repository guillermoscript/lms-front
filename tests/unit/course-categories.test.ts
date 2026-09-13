import { describe, expect, it } from 'vitest'
import { categoryMessageKey } from '@/lib/course-categories'
import en from '@/messages/en.json'
import es from '@/messages/es.json'

/**
 * #724: the catalog's category chips rendered the raw `course_categories.name`,
 * so the Spanish catalog showed the four seeded English names. Only those four
 * map to a message key; a category a school typed itself stays as typed.
 */
describe('categoryMessageKey', () => {
  it('maps the seeded names, whatever their casing or spacing', () => {
    expect(categoryMessageKey('Programming')).toBe('programming')
    expect(categoryMessageKey('design')).toBe('design')
    expect(categoryMessageKey('  BUSINESS  ')).toBe('business')
    expect(categoryMessageKey('Data  Science')).toBe('dataScience')
  })

  it('leaves a school-created category alone', () => {
    expect(categoryMessageKey('Repostería')).toBeNull()
    expect(categoryMessageKey('Oposiciones')).toBeNull()
    expect(categoryMessageKey('')).toBeNull()
    expect(categoryMessageKey(null)).toBeNull()
    expect(categoryMessageKey(undefined)).toBeNull()
  })

  it('only returns keys both catalogs actually define', () => {
    const seeded = ['Programming', 'Design', 'Business', 'Data Science']
    for (const name of seeded) {
      const key = categoryMessageKey(name)
      expect(key).not.toBeNull()
      expect(en.coursesCatalog.categories).toHaveProperty(key as string)
      expect(es.coursesCatalog.categories).toHaveProperty(key as string)
    }
  })
})
