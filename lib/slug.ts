/**
 * Public URL slugs — "8-ingles-basico-para-hispanohablantes".
 *
 * The numeric id leads and the slug trails it. The id is what resolves the row
 * (unique, never changes), the slug is only there for people and search
 * engines, so renaming a course never breaks an old link: any slug (or none)
 * resolves, and the page redirects to the current canonical one.
 */

const MAX_SLUG_LENGTH = 60

/** Lowercase ASCII, hyphen-separated, accents stripped, cut at a word boundary. */
export function slugify(text: string | null | undefined): string {
  const slug = (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG_LENGTH) return slug
  const cut = slug.slice(0, MAX_SLUG_LENGTH)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}

/** `8` + "Inglés Básico" -> `8-ingles-basico` (just `8` when the title has no usable characters). */
export function withSlug(id: number | string, title: string | null | undefined): string {
  const slug = slugify(title)
  return slug ? `${id}-${slug}` : String(id)
}

/** The numeric id at the head of a `[id]` segment (`8` or `8-anything`), or `null`. */
export function parseSlugId(param: string | null | undefined): number | null {
  let decoded = param ?? ''
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // Malformed escape: match on the raw segment, which will simply not parse.
  }
  const match = /^(\d+)(?:-|$)/.exec(decoded)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}
