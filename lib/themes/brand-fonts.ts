/**
 * Reads the kit heading font files (`KIT_HEADING_FONT_FILES`) for renderers
 * that need real font bytes or paths: `@react-pdf` (`Font.register`),
 * node-canvas (`registerFont`) and satori (`ImageResponse` `fonts`). Issue #765.
 *
 * Node only. A missing file is logged once and reported as `null`, so a
 * renderer falls back to its built-in face rather than failing the document.
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { KIT_HEADING_FONT_FILES, type KitHeadingFont, type KitHeadingFontWeight } from '@/lib/themes/brand-outputs'

/** Absolute path to a heading font file, or `null` when it is not on disk. */
export function headingFontPath(family: KitHeadingFont, weight: KitHeadingFontWeight): string | null {
  const absolute = path.join(/*turbopackIgnore: true*/ process.cwd(), KIT_HEADING_FONT_FILES[family][weight])
  if (existsSync(absolute)) return absolute
  warnMissing(absolute)
  return null
}

const bytes = new Map<string, Promise<Buffer | null>>()
const warned = new Set<string>()

function warnMissing(file: string) {
  if (warned.has(file)) return
  warned.add(file)
  console.warn('[brand-fonts] heading font file not found, using the built-in face:', file)
}

/** The bytes of a heading font file, read once per process; `null` when unreadable. */
export function readHeadingFont(family: KitHeadingFont, weight: KitHeadingFontWeight): Promise<Buffer | null> {
  const relative = KIT_HEADING_FONT_FILES[family][weight]
  let pending = bytes.get(relative)
  if (!pending) {
    const absolute = path.join(/*turbopackIgnore: true*/ process.cwd(), relative)
    pending = readFile(absolute).catch(() => {
      warnMissing(absolute)
      bytes.delete(relative)
      return null
    })
    bytes.set(relative, pending)
  }
  return pending
}
