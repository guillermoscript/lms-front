import type { SchoolBrand } from '@/lib/themes/school-brand'
import { escapeHtml, schoolButton, schoolLogoHeader } from './school-brand-parts'

/**
 * Sent to each enrolled student when a teacher deletes a course outright.
 *
 * Locale follows the deleting teacher's request locale (the school's UI
 * language) — the same compromise `daily-digest.ts` makes, since a student's
 * own preferred language is not stored.
 */
export type CourseRemovedLocale = 'en' | 'es'

export interface CourseRemovedEmailData {
  courseTitle: string
  schoolName: string
  browseUrl: string
  locale?: string | null
  brand: SchoolBrand
}

const COPY = {
  en: {
    subject: (course: string, school: string) => `Course "${course}" has been removed — ${school}`,
    greeting: 'Hi,',
    body: (course: string, school: string) =>
      `The course <strong>${course}</strong> that you were enrolled in has been removed from ${school}. We're sorry for any inconvenience.`,
    cta: 'Browse other courses',
  },
  es: {
    subject: (course: string, school: string) => `El curso "${course}" fue eliminado — ${school}`,
    greeting: 'Hola,',
    body: (course: string, school: string) =>
      `El curso <strong>${course}</strong> en el que estabas inscrito fue eliminado de ${school}. Lamentamos las molestias.`,
    cta: 'Explorar otros cursos',
  },
} as const

export function resolveCourseRemovedLocale(locale: string | null | undefined): CourseRemovedLocale {
  return locale?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function courseRemovedTemplate(data: CourseRemovedEmailData): { subject: string; html: string } {
  const copy = COPY[resolveCourseRemovedLocale(data.locale)]
  const course = escapeHtml(data.courseTitle)
  const school = escapeHtml(data.schoolName)

  return {
    subject: copy.subject(data.courseTitle, data.schoolName),
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  ${schoolLogoHeader(data.brand)}
  <p>${copy.greeting}</p>
  <p>${copy.body(course, school)}</p>
  <p style="text-align:center;margin:32px 0">
    ${schoolButton(data.brand, data.browseUrl, copy.cta)}
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">${school}</p>
</body>
</html>`,
  }
}
