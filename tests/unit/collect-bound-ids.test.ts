import { describe, expect, it } from 'vitest'
import {
  collectBoundIds,
  missingIds,
  normalizeIntegerId,
  normalizeIntegerIdList,
} from '@/lib/puck/utils/collect-bound-ids'

describe('normalizeIntegerId', () => {
  it('accepts integers as numbers or strings and canonicalises them', () => {
    expect(normalizeIntegerId(7)).toBe('7')
    expect(normalizeIntegerId('7')).toBe('7')
    expect(normalizeIntegerId(' 007 ')).toBe('7')
  })

  it('rejects anything that is not a non-negative integer', () => {
    for (const bad of ['', 'abc', '1.5', '-3', '1; drop table', null, undefined, 1.5, -1, NaN, {}, []]) {
      expect(normalizeIntegerId(bad)).toBeNull()
    }
  })
})

describe('normalizeIntegerIdList', () => {
  it('accepts the picker shape {id}[], bare strings and bare numbers', () => {
    expect(normalizeIntegerIdList([{ id: '3' }, { id: 4 }, '5', 6, { id: 'x' }, null, { nope: 1 }])).toEqual([
      '3',
      '4',
      '5',
      '6',
    ])
    expect(normalizeIntegerIdList(undefined)).toEqual([])
    expect(normalizeIntegerIdList('3')).toEqual([])
  })
})

describe('collectBoundIds', () => {
  const page = {
    root: { props: { title: 'x', courseId: '999' } }, // root props are not blocks
    content: [
      { type: 'CourseHero', props: { id: 'CourseHero-1', courseId: '12' } },
      { type: 'EnrollCta', props: { id: 'EnrollCta-1', courseId: 12 } }, // number shape, same id
      { type: 'CourseGrid', props: { id: 'CourseGrid-1', courseIds: [{ id: '3' }, { id: '12' }, { id: '' }] } },
      { type: 'ProductGrid', props: { id: 'ProductGrid-1', productIds: [{ id: '40' }, '41'] } },
      { type: 'PricingTable', props: { id: 'PricingTable-1', planIds: [{ id: '8' }] } },
      { type: 'HeroBlock', props: { id: 'HeroBlock-1', title: 'no bindings' } },
    ],
    zones: {
      'Columns-1:column-0': [
        { type: 'CoursePricingCard', props: { id: 'CoursePricingCard-1', courseId: '', productId: '42' } },
        { type: 'CourseCurriculum', props: { id: 'CourseCurriculum-1', courseId: '77' } },
      ],
      'Columns-1:column-1': [
        {
          type: 'InstructorCard',
          props: { id: 'InstructorCard-1', teacherUserId: '6F9619FF-8B86-D011-B42D-00C04FC964FF', courseId: 'abc' },
        },
      ],
    },
  }

  it('walks content AND zones, dedupes, normalises both id shapes', () => {
    const ids = collectBoundIds(page)
    expect(ids.courseIds).toEqual(['12', '3', '77'])
    expect(ids.detailCourseIds).toEqual(['12', '77'])
    expect(ids.productIds).toEqual(['40', '41', '42'])
    expect(ids.planIds).toEqual(['8'])
    expect(ids.teacherUserIds).toEqual(['6f9619ff-8b86-d011-b42d-00c04fc964ff'])
  })

  it('ignores root props and invalid values', () => {
    const ids = collectBoundIds(page)
    expect(ids.courseIds).not.toContain('999')
    expect(ids.courseIds).not.toContain('abc')
  })

  it('unions several pages (the admin list resolves every page it may open)', () => {
    const other = { content: [{ type: 'CourseHero', props: { courseId: '5' } }] }
    expect(collectBoundIds([page, other]).detailCourseIds).toEqual(['12', '77', '5'])
  })

  it('is total on garbage input', () => {
    for (const bad of [null, undefined, 'x', 3, {}, { content: 'nope', zones: 5 }, { content: [null, 1, { props: null }] }]) {
      expect(collectBoundIds(bad)).toEqual({
        courseIds: [],
        detailCourseIds: [],
        productIds: [],
        planIds: [],
        teacherUserIds: [],
      })
    }
  })
})

describe('missingIds', () => {
  it('returns wanted ids not yet known, in order', () => {
    expect(missingIds(['1', '2', '3'], new Set(['2']))).toEqual(['1', '3'])
    expect(missingIds([], ['1'])).toEqual([])
  })
})
