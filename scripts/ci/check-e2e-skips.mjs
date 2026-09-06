#!/usr/bin/env node
// Summarise a Playwright JSON report and fail when a test was skipped because
// the environment was missing something (#667).
//
// Before this gate, 15+ specs did `test.skip(!process.env.CRON_SECRET, …)` or
// skipped on a missing service-role key / webhook secret. A run without those
// reported green while never exercising billing, crons or webhook claims.
// The CI job provides every one of them, so any such skip is a CI bug.
//
// Usage: node scripts/ci/check-e2e-skips.mjs [playwright-report/results.json]

import fs from 'node:fs'

const file = process.argv[2] ?? 'playwright-report/results.json'

if (!fs.existsSync(file)) {
  console.error(`No Playwright JSON report at ${file} — did the run start?`)
  process.exit(1)
}

const report = JSON.parse(fs.readFileSync(file, 'utf8'))

// Skip messages that mean "the environment lacked X". Skips that gate on the
// Playwright project ("runs once — DB state is shared", "DB-only regression —
// single project") are deliberate and never match this.
const ENV_SKIP = /\b(required|not set|not configured|credentials|missing)\b/i

/** @type {{file:string,title:string,project:string,status:string,reasons:string[]}[]} */
const tests = []

function walk(suite, titles, isRoot = false) {
  // Root suites are titled with the file name, which is already reported.
  const path = suite.title && !isRoot ? [...titles, suite.title] : titles
  for (const child of suite.suites ?? []) walk(child, path)
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      tests.push({
        file: spec.file ?? suite.file ?? '',
        title: [...path, spec.title].join(' › '),
        project: t.projectName ?? '',
        status: t.status,
        reasons: (t.annotations ?? [])
          .filter((a) => (a.type === 'skip' || a.type === 'fixme') && a.description)
          .map((a) => a.description),
      })
    }
  }
}
for (const suite of report.suites ?? []) walk(suite, [], true)

const skipped = tests.filter((t) => t.status === 'skipped')
const envSkips = skipped.filter((t) => t.reasons.some((r) => ENV_SKIP.test(r)))
const otherSkips = skipped.filter((t) => !envSkips.includes(t))
const stats = report.stats ?? {}

const lines = []
lines.push('## Playwright')
lines.push('')
lines.push('| passed | failed | flaky | skipped | env-skips |')
lines.push('|---:|---:|---:|---:|---:|')
lines.push(
  `| ${stats.expected ?? 0} | ${stats.unexpected ?? 0} | ${stats.flaky ?? 0} | ${skipped.length} | ${envSkips.length} |`
)
lines.push('')

if (envSkips.length > 0) {
  lines.push('### ❌ Skipped for a missing env var (must be 0)')
  lines.push('')
  for (const t of envSkips) lines.push(`- \`${t.file}\` ${t.title} — ${t.reasons.join('; ')}`)
  lines.push('')
}

if (otherSkips.length > 0) {
  lines.push('<details><summary>Other skips (deliberate: project-gated, permanent, or data-gated)</summary>')
  lines.push('')
  for (const t of otherSkips) {
    const why = t.reasons.length ? ` — ${t.reasons.join('; ')}` : ''
    lines.push(`- \`${t.file}\` ${t.title}${why}`)
  }
  lines.push('')
  lines.push('</details>')
  lines.push('')
}

const out = lines.join('\n')
console.log(out)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n')

if (envSkips.length > 0) {
  console.error(`\n${envSkips.length} test(s) skipped because the CI environment was missing something.`)
  process.exit(1)
}
