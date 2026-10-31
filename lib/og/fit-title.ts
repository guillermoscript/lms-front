/**
 * Picks a font size at which a title fits its box on an OG card.
 *
 * satori has no text measurement hook, so this estimates with an average
 * glyph width for a bold sans (0.58em, slightly pessimistic) and a greedy word
 * wrap. The two things that used to break long titles are both covered: a
 * single long word wider than the column ("Hispanohablantes" in a 424px
 * column), and too many wrapped lines for the box height.
 */

const AVG_GLYPH_EM = 0.58

export interface FitTitleOptions {
  /** Width of the text box in px. */
  width: number
  /** Height available to the title in px. */
  height: number
  maxFont: number
  minFont: number
  lineHeight: number
}

export interface FittedTitle {
  fontSize: number
  /** Lines that fit at `fontSize`; pass as `lineClamp` so the overflow ends in an ellipsis. */
  maxLines: number
}

function lineCount(words: string[], charsPerLine: number): number | null {
  let lines = 1
  let used = 0
  for (const word of words) {
    if (word.length > charsPerLine) return null
    if (used === 0) used = word.length
    else if (used + 1 + word.length <= charsPerLine) used += 1 + word.length
    else {
      lines += 1
      used = word.length
    }
  }
  return lines
}

export function fitTitle(title: string, { width, height, maxFont, minFont, lineHeight }: FitTitleOptions): FittedTitle {
  const words = title.split(/\s+/).filter(Boolean)
  for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 2) {
    const charsPerLine = Math.floor(width / (fontSize * AVG_GLYPH_EM))
    const lines = lineCount(words, charsPerLine)
    const maxLines = Math.max(1, Math.floor(height / (fontSize * lineHeight)))
    if (lines !== null && lines <= maxLines) return { fontSize, maxLines }
  }
  // Nothing fits: smallest size, clamped with an ellipsis rather than overflowing.
  return { fontSize: minFont, maxLines: Math.max(1, Math.floor(height / (minFont * lineHeight))) }
}
