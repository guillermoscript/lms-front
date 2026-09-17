/**
 * Proves a branch introduces no new ESLint problems in the files it changed.
 *
 * Lints each changed file as it is now, and again as HEAD has it (via
 * `git show`, linted through the ESLint API's lintText so the path — and so the
 * config that applies to it — stays the same). Prints a per-file, per-rule
 * comparison and exits non-zero only if a count went up.
 *
 * Usage: node docs/handoff/764-surface3/scripts/lint-compare.mjs <base-ref>
 */
import { ESLint } from 'eslint'
import { execFileSync } from 'node:child_process'

const base = process.argv[2] ?? 'master'
const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`, '--', '*.ts', '*.tsx'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
const dirty = execFileSync('git', ['diff', '--name-only', '--', '*.ts', '*.tsx'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
const all = [...new Set([...files, ...dirty])]

const eslint = new ESLint()
function tally(results) {
  const t = {}
  for (const r of results) for (const m of r.messages) t[m.ruleId ?? 'parse-error'] = (t[m.ruleId ?? 'parse-error'] ?? 0) + 1
  return t
}

let regressions = 0
for (const file of all) {
  const now = tally(await eslint.lintFiles([file]))
  let wasSource = ''
  try {
    wasSource = execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' })
  } catch {
    console.log(`NEW FILE ${file}: ${JSON.stringify(now)}`)
    continue
  }
  const was = tally(await eslint.lintText(wasSource, { filePath: file }))
  const rules = [...new Set([...Object.keys(now), ...Object.keys(was)])].sort()
  const worse = rules.filter((r) => (now[r] ?? 0) > (was[r] ?? 0))
  const better = rules.filter((r) => (now[r] ?? 0) < (was[r] ?? 0))
  if (worse.length) {
    regressions++
    console.log(`WORSE  ${file}`)
    for (const r of worse) console.log(`         ${r}: ${was[r] ?? 0} -> ${now[r]}`)
  } else if (better.length) {
    console.log(`BETTER ${file}`)
    for (const r of better) console.log(`         ${r}: ${was[r] ?? 0} -> ${now[r]}`)
  } else if (rules.length) {
    console.log(`SAME   ${file}  ${rules.map((r) => `${r}=${now[r] ?? 0}`).join(' ')}`)
  }
}
console.log(regressions ? `\n${regressions} file(s) got worse` : `\nNo file got worse across ${all.length} file(s)`)
process.exit(regressions ? 1 : 0)
