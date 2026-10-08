import { describe, expect, it, vi } from 'vitest'
import { includedCourses, resolveCourseBinding, resolveProductBinding } from '@/lib/puck/components/lms/course/binding'
import type { LandingCourse, LandingCourseDetails, PuckMetadata } from '@/lib/puck/types'

vi.mock('@/app/actions/admin/landing-course-details', () => ({ getLandingCourseDetails: vi.fn() }))
const { carryOverMetadata, idsToFetch, mergeLandingMetadata } = await import('@/components/admin/landing-page/use-landing-metadata')

const c = (id: string, status: 'published' | 'draft' = 'published'): LandingCourse => ({
  id,
  title: `Course ${id}`,
  description: null,
  image: null,
  price: null,
  currency: null,
  status,
})
const details = (id: string, status: 'published' | 'draft' = 'published'): LandingCourseDetails => ({
  ...c(id, status),
  objectives: [],
  lessons: [],
  lessonCount: 0,
  author: null,
  rating: { avg: null, count: 0 },
  reviews: [],
  previewEnabled: true,
})

const meta: PuckMetadata = {
  courses: [c('1'), c('2')],
  courseDetails: { '1': details('1'), '9': details('9', 'draft') },
  products: [{ id: '40', name: 'P', description: null, image: null, price: 5, currency: 'usd', courseIds: ['1', '2', '77'], href: '/products/40' }],
}

describe('resolveCourseBinding', () => {
  it('unbound / missing / draft / ready', () => {
    expect(resolveCourseBinding(meta, '').state).toBe('unbound')
    expect(resolveCourseBinding(meta, 'abc').state).toBe('unbound')
    expect(resolveCourseBinding(meta, '3').state).toBe('missing')
    expect(resolveCourseBinding(meta, '9').state).toBe('draft')
    const ready = resolveCourseBinding(meta, 1) // number shape (D2)
    expect(ready.state).toBe('ready')
    expect(ready.details?.id).toBe('1')
    // in the list but no details yet → ready with details null (editor shows "loading")
    expect(resolveCourseBinding(meta, '2')).toMatchObject({ state: 'ready', details: null })
  })

  it('is total on missing metadata', () => {
    expect(resolveCourseBinding(undefined, '1').state).toBe('missing')
  })
})

describe('resolveProductBinding + includedCourses', () => {
  it('resolves products and lists only known published courses', () => {
    expect(resolveProductBinding(meta, '').state).toBe('unbound')
    expect(resolveProductBinding(meta, '41').state).toBe('missing')
    const p = resolveProductBinding(meta, '40')
    expect(p.state).toBe('ready')
    expect(includedCourses(meta, p.product!.courseIds).map((x) => x.id)).toEqual(['1', '2'])
  })
})

describe('useLandingMetadata helpers', () => {
  it('idsToFetch lists only ids the metadata does not cover', () => {
    const page = {
      content: [
        { type: 'CourseHero', props: { courseId: '2' } }, // in list, no details → detail fetch
        { type: 'CourseHero', props: { courseId: '1' } }, // fully known
        { type: 'CourseGrid', props: { courseIds: [{ id: '5' }] } },
        { type: 'ProductGrid', props: { productIds: [{ id: '40' }, { id: '41' }] } },
      ],
    }
    expect(idsToFetch(meta, page)).toEqual({ courseIds: ['5'], detailCourseIds: ['2'], productIds: ['41'] })
  })

  it('mergeLandingMetadata unions lists, keeps drafts out of the picker list, merges details', () => {
    const merged = mergeLandingMetadata(meta, {
      courses: [c('2'), c('5'), c('6', 'draft')],
      courseDetails: { '2': details('2') },
      products: [{ ...meta.products![0], id: '41' }],
    })
    expect(merged.courses!.map((x) => x.id)).toEqual(['1', '2', '5'])
    expect(Object.keys(merged.courseDetails!).sort()).toEqual(['1', '2', '9'])
    expect(merged.products!.map((p) => p.id)).toEqual(['40', '41'])
    // the input is not mutated
    expect(meta.courses!.map((x) => x.id)).toEqual(['1', '2'])
  })

  it('carryOverMetadata: a refreshed server bundle keeps what was fetched for unsaved bindings', () => {
    const fetched = mergeLandingMetadata(meta, { courses: [c('42')], courseDetails: { '42': details('42') }, products: [] })
    const refreshed: PuckMetadata = { ...meta, courses: [c('1')], courseDetails: { '1': details('1') } }
    const next = carryOverMetadata(refreshed, fetched)
    expect(next.courses!.map((x) => x.id)).toEqual(['1', '2', '42'])
    expect(Object.keys(next.courseDetails!).sort()).toEqual(['1', '42', '9'])
    // The new bundle wins where both have a value.
    expect(next.courseDetails!['1']).toBe(refreshed.courseDetails!['1'])
  })
})
