import { describe, expect, it } from 'vitest'
import { isNavActive } from '@/hooks/use-active-nav'

const COURSES = '/dashboard/student/courses'
const COMPLETED = '/dashboard/student/courses?status=completed'

describe('isNavActive (#729)', () => {
  it('matches a plain href on its own path and nested paths', () => {
    expect(isNavActive(COURSES, COURSES)).toBe(true)
    expect(isNavActive(COURSES, '/dashboard/student/courses/1/lessons/2')).toBe(true)
    expect(isNavActive(COURSES, '/dashboard/student/certificates')).toBe(false)
  })

  it('does not let a dashboard root match everything beneath it', () => {
    expect(isNavActive('/dashboard/student', '/dashboard/student')).toBe(true)
    expect(isNavActive('/dashboard/student', '/dashboard/student/courses')).toBe(false)
  })

  it('requires the exact path for an href with a query string', () => {
    // The regression: "Completed" lit up inside every lesson and exam page.
    expect(isNavActive(COMPLETED, '/dashboard/student/courses/1/lessons/2', new URLSearchParams())).toBe(false)
    expect(isNavActive(COMPLETED, '/dashboard/student/courses/1/exams/3', new URLSearchParams('status=completed'))).toBe(false)
  })

  it('requires every query param of the href to be present', () => {
    expect(isNavActive(COMPLETED, COURSES, new URLSearchParams('status=completed'))).toBe(true)
    expect(isNavActive(COMPLETED, COURSES, new URLSearchParams('status=completed&page=2'))).toBe(true)
    expect(isNavActive(COMPLETED, COURSES, new URLSearchParams('status=active'))).toBe(false)
    expect(isNavActive(COMPLETED, COURSES, new URLSearchParams())).toBe(false)
    expect(isNavActive(COMPLETED, COURSES, null)).toBe(false)
  })
})
