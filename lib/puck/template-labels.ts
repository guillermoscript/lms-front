/**
 * Translating the landing-page template picker (#726).
 *
 * Template names and descriptions live in the template data itself
 * (`lib/puck/templates/*`), which is also what the MCP tools and any stored
 * page reference, so the data keeps its English identity and only the picker's
 * *display* is translated. A template whose name has no key here falls back to
 * the name as written, so adding a template never renders a blank card.
 */

/** Template name as written in the data → key under `landingPageBuilder.templates`. */
const TEMPLATE_KEYS: Record<string, string> = {
  Blank: 'blank',
  'Modern Academy': 'modernAcademy',
  Minimal: 'minimal',
  'Bold Creator': 'boldCreator',
  'Course Catalog': 'courseCatalog',
  'About Us': 'aboutUs',
  Contact: 'contact',
  FAQ: 'faq',
  'Free Course School': 'freeCourseSchool',
  'Business Coaching — Home': 'businessCoachingHome',
  'Business Coaching — About': 'businessCoachingAbout',
  'Business Coaching — FAQ': 'businessCoachingFaq',
  'Business Coaching — Contact': 'businessCoachingContact',
  'Design School — Home': 'designSchoolHome',
  'Design School — About': 'designSchoolAbout',
  'Design School — FAQ': 'designSchoolFaq',
  'Design School — Contact': 'designSchoolContact',
  'Fitness Studio — Home': 'fitnessStudioHome',
  'Fitness Studio — About': 'fitnessStudioAbout',
  'Fitness Studio — FAQ': 'fitnessStudioFaq',
  'Fitness Studio — Contact': 'fitnessStudioContact',
  'Code School — Home': 'codeSchoolHome',
  'Code School — About': 'codeSchoolAbout',
  'Code School — FAQ': 'codeSchoolFaq',
  'Code School — Contact': 'codeSchoolContact',
  'Code School — Courses': 'codeSchoolCourses',
  'Language School — Home': 'languageSchoolHome',
  'Language School — About': 'languageSchoolAbout',
  'Language School — FAQ': 'languageSchoolFaq',
  'Language School — Contact': 'languageSchoolContact',
  'Music Academy — Home': 'musicAcademyHome',
  'Music Academy — About': 'musicAcademyAbout',
  'Music Academy — FAQ': 'musicAcademyFaq',
  'Music Academy — Contact': 'musicAcademyContact',
}

/** The message key for a template, or `null` when it has none. */
export function templateMessageKey(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  return TEMPLATE_KEYS[name.trim()] ?? null
}

/** Every key this map can produce — used by the catalogue test. */
export const TEMPLATE_MESSAGE_KEYS = Object.values(TEMPLATE_KEYS)
