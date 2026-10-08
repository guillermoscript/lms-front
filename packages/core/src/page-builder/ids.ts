/**
 * Block ids and tenant-id references (design §3.2 "IDs", critique D2).
 *
 * Block ids are always server-assigned `<Type>-<random>`; ids a model proposes are ignored.
 * Ref values (course/product/plan ids) arrive in two shapes — `EnrollCta.courseId` is a
 * string, `CourseGrid.courseIds` is the picker's `{id}[]` — and database ids are integers, so
 * every comparison goes through `normalizeRefIds` (trimmed strings).
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Random [a-z0-9] string. Uses getRandomValues (available on insecure origins too). */
export function randomSlug(length = 10): string {
  const bytes = new Uint8Array(length)
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

/** `(type) => id` — injectable so tests can produce deterministic ids. */
export type IdFactory = (type: string) => string

/** The default block id: `<Type>-<10 random chars>`. */
export const newBlockId: IdFactory = (type) => `${type}-${randomSlug(10)}`

/** Normalise one id-ish value (`12`, `" 12 "`, `{id: 12}`) to a trimmed string, or null. */
export function normalizeId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') {
    const s = value.trim()
    return s ? s : null
  }
  if (value && typeof value === 'object' && 'id' in value) {
    return normalizeId((value as { id: unknown }).id)
  }
  return null
}

/**
 * Normalise a ref value of any accepted shape — a single id, an array of ids or of `{id}`
 * objects — to a list of trimmed, non-empty strings. Empty values produce `[]`.
 */
export function normalizeRefIds(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return []
  const list = Array.isArray(value) ? value : [value]
  const out: string[] = []
  for (const v of list) {
    const id = normalizeId(v)
    if (id !== null) out.push(id)
  }
  return out
}
