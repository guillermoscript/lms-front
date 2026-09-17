/**
 * Totals the axe colour-contrast violations a matrix run recorded.
 * Usage: node docs/handoff/764-surface3/scripts/axe-summary.mjs <dir> [<dir2> …]   (dir2 compared against dir)
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

function load(dir) {
  const out = {}
  for (const f of readdirSync(dir)) {
    if (!/^axe-color-contrast.*\.json$/.test(f)) continue
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
    for (const [k, v] of Object.entries(j)) {
      if (k.endsWith('__prepare') || k.startsWith('combo-')) continue
      out[k] = typeof v?.count === 'number' ? v.count : null
    }
  }
  return out
}

const dirs = process.argv.slice(2)
const sets = dirs.map(load)
const keys = [...new Set(sets.flatMap((s) => Object.keys(s)))].sort()
const screenOf = (k) => k.replace(/-(estructura|andina|kodigo|luz|platform)-(light|dark)$/, '')

const byScreen = {}
for (const k of keys) {
  const s = screenOf(k)
  byScreen[s] ??= sets.map(() => 0)
  sets.forEach((set, i) => { byScreen[s][i] += set[k] ?? 0 })
}
const totals = sets.map(() => 0)
for (const [s, counts] of Object.entries(byScreen).sort()) {
  counts.forEach((c, i) => { totals[i] += c })
  console.log(`${s.padEnd(30)} ${counts.map((c) => String(c).padStart(5)).join(' ->')}`)
}
console.log(`${'TOTAL'.padEnd(30)} ${totals.map((c) => String(c).padStart(5)).join(' ->')}`)
console.log(`combinations measured: ${keys.length}`)
const errs = sets.map((s) => Object.values(s).filter((v) => v === null).length)
if (errs.some(Boolean)) console.log(`entries with an error instead of a count: ${errs.join(' / ')}`)
