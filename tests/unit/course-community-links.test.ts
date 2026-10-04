import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CommunityCourse } from '@/lib/community/access'

const { locale } = vi.hoisted(() => ({ locale: { value: 'en' } }))
vi.mock('next-intl/server', () => ({
  getLocale: async () => locale.value,
  getTranslations: async () => (key: string) => key,
}))

import { CourseCommunityLinks } from '@/components/community/course-community-links'

const courses: CommunityCourse[] = Array.from({ length: 7 }, (_, i) => ({
  courseId: i + 1,
  title: `Course ${i + 1}`,
}))

describe('course community links', () => {
  it.each(['en', 'es'])('keeps %s in visible and folded course URLs', async (language) => {
    locale.value = language
    const html = renderToStaticMarkup(await CourseCommunityLinks({ courses }))
    for (const course of courses) {
      expect(html).toContain(`href="/${language}/dashboard/student/courses/${course.courseId}/community"`)
    }
    expect(html).not.toContain('href="/dashboard/')
  })
})
