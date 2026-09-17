// Per-file [palette, raw] using the guard's own regexes (tests/unit/palette-class-guard.test.ts).
// Usage: node docs/handoff/764-surface3/scripts/count.mjs <file> [<file> …]
import { readFileSync } from 'node:fs'
const PREFIX = '(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|decoration|placeholder|accent|caret)'
const PALETTE = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*${PREFIX}-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}(?:/\\d{1,3})?(?![\\w-])`, 'g')
const ARB = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*${PREFIX}-\\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch)\\([^\\]]*\\))\\](?:/\\d{1,3})?(?![\\w-])`, 'g')
const WB = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*${PREFIX}-(?:white|black)(?:/\\d{1,3})?(?![\\w-])`, 'g')
let tp = 0, tr = 0
for (const f of process.argv.slice(2)) {
  const s = readFileSync(f, 'utf8')
  const p = s.match(PALETTE) ?? []
  const r = [...(s.match(ARB) ?? []), ...(s.match(WB) ?? [])]
  tp += p.length; tr += r.length
  console.log(`${String(p.length).padStart(4)} ${String(r.length).padStart(3)}  ${f}`)
  if (p.length) console.log(`        palette: ${[...new Set(p)].join(' ')}`)
  if (r.length) console.log(`        raw:     ${[...new Set(r)].join(' ')}`)
}
console.log(`TOTAL palette=${tp} raw=${tr}`)
