/**
 * Translating the catalog's category chips (#724).
 *
 * `course_categories` rows are data, not UI copy, and the four the seed
 * creates are stored in English ("Programming", "Design", "Business",
 * "Data Science"). They rendered verbatim, so the Spanish catalog showed
 * English chips.
 *
 * Only those four seeded names map to a message key. A category a school
 * typed itself is its own words and is shown exactly as entered — guessing
 * at a translation for it would be worse than leaving it alone.
 */

/** Seeded category name (lowercased) → key under `coursesCatalog.categories`. */
const SEEDED_CATEGORY_KEYS: Record<string, string> = {
  programming: 'programming',
  design: 'design',
  business: 'business',
  'data science': 'dataScience',
}

/**
 * The message key for a category name, or `null` when the name is a school's
 * own and should be rendered as typed.
 */
export function categoryMessageKey(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return SEEDED_CATEGORY_KEYS[normalized] ?? null
}
