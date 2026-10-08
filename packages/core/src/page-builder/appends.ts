/**
 * `appends`: token-by-token text streaming (design §3.2).
 *
 * An `update{appends}` op maps a prop path (`title`, `items[2].answer`, `a.b[0].c`) to a tail
 * that is appended to the string already there. Paths are resolved immutably: only the
 * objects along the path are copied, so a reducer can hand the result to Puck as-is.
 */

export type PathSegment = string | number

const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor'])

/**
 * Parse `a.b[2].c` (or `a.b.2.c`) into `['a', 'b', 2, 'c']`. Returns null for a malformed
 * path or a prototype-polluting segment.
 */
export function parsePath(path: string): PathSegment[] | null {
  if (typeof path !== 'string' || !path) return null
  const out: PathSegment[] = []
  const re = /([^.[\]]+)|\[(\d+)\]/g
  let consumed = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(path))) {
    // Only `.` may sit between tokens.
    const gap = path.slice(consumed, m.index)
    if (consumed === 0 && m.index !== 0) return null
    if (gap !== '' && gap !== '.') return null
    if (gap === '' && consumed > 0 && m[1] !== undefined) return null
    if (m[2] !== undefined) out.push(Number(m[2]))
    else {
      const seg = m[1]
      if (FORBIDDEN.has(seg)) return null
      out.push(/^\d+$/.test(seg) ? Number(seg) : seg)
    }
    consumed = m.index + m[0].length
  }
  if (consumed !== path.length || out.length === 0) return null
  if (typeof out[0] !== 'string') return null
  return out
}

/** Read the value at a path, or undefined. */
export function getAtPath(obj: unknown, path: PathSegment[]): unknown {
  let cur: unknown = obj
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string | number, unknown>)[seg]
  }
  return cur
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return v !== null && typeof v === 'object'
}

/**
 * Immutably set the value at a path. Every intermediate container must already exist (an
 * array index must be in range): streaming adds array skeletons with an `update{props}`
 * first. Returns null when the path cannot be resolved.
 */
export function setAtPath<T extends Record<string, unknown>>(obj: T, path: PathSegment[], value: unknown): T | null {
  if (path.length === 0) return null
  const [head, ...rest] = path
  if (Array.isArray(obj)) {
    if (typeof head !== 'number' || head < 0 || head >= obj.length) return null
    const copy = obj.slice()
    if (rest.length === 0) copy[head] = value
    else {
      const child = copy[head]
      if (!isContainer(child)) return null
      const next = setAtPath(child as Record<string, unknown>, rest, value)
      if (next === null) return null
      copy[head] = next
    }
    return copy as unknown as T
  }
  if (!isContainer(obj) || typeof head !== 'string') return null
  if (rest.length === 0) return { ...obj, [head]: value }
  const child = (obj as Record<string, unknown>)[head]
  if (!isContainer(child)) return null
  const next = setAtPath(child as Record<string, unknown>, rest, value)
  if (next === null) return null
  return { ...obj, [head]: next }
}

export interface AppendsResult<T> {
  props: T
  warnings: string[]
}

/**
 * Apply `appends` to `props`: each tail is concatenated onto the string at its path. A missing
 * or null leaf starts from `''`; a non-string leaf or an unresolvable path is skipped with a
 * warning. `skipKeys` lists top-level keys that the same op also set in `props` (a key goes
 * in one or the other, never both).
 */
export function resolveAppends<T extends Record<string, unknown>>(
  props: T,
  appends: Record<string, string> | undefined,
  skipKeys: ReadonlySet<string> = new Set()
): AppendsResult<T> {
  const warnings: string[] = []
  let out = props
  for (const [rawPath, tail] of Object.entries(appends ?? {})) {
    const path = parsePath(rawPath)
    if (!path) {
      warnings.push(`appends: invalid path "${rawPath}"`)
      continue
    }
    if (skipKeys.has(path[0] as string)) {
      warnings.push(`appends: "${rawPath}" is also set in props; append ignored`)
      continue
    }
    if (typeof tail !== 'string') {
      warnings.push(`appends: tail for "${rawPath}" is not a string`)
      continue
    }
    const current = getAtPath(out, path)
    if (current !== undefined && current !== null && typeof current !== 'string') {
      warnings.push(`appends: "${rawPath}" is not a text field`)
      continue
    }
    const next = setAtPath(out, path, (current ?? '') + tail)
    if (next === null) {
      warnings.push(`appends: path "${rawPath}" does not exist`)
      continue
    }
    out = next
  }
  return { props: out, warnings }
}
