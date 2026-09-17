/**
 * Builds one before/after contact sheet per screen for issue #764 surface 2.
 *
 * Each sheet is a 2-row grid: the top row is `master`, the bottom row is the
 * branch, and the columns are every theme x mode combination the matrix
 * captured. Cells are top-anchored so the hero of each page lines up, which is
 * where the sweep is most visible.
 *
 * Usage: npx tsx scripts/qa-contact-sheet.ts <beforeDir> <afterDir> <outDir>
 */

import { chromium } from 'playwright'
import { readdirSync, mkdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

const THEMES = ['estructura', 'andina', 'kodigo', 'luz', 'platform']
const MODES = ['light', 'dark']
const CELL_W = 340
const CELL_H = 560

const BRANCH = process.env.SHEET_BRANCH ?? execSync("git rev-parse --abbrev-ref HEAD").toString().trim()

function screensIn(dir: string): string[] {
  const names = new Set<string>()
  for (const f of readdirSync(dir)) {
    const m = /^(.*)-([a-z]+)-(light|dark)\.png$/.exec(f)
    if (m && THEMES.includes(m[2])) names.add(m[1])
  }
  return [...names].sort()
}

function cell(dir: string, screen: string, theme: string, mode: string): string {
  const file = path.join(dir, `${screen}-${theme}-${mode}.png`)
  if (!existsSync(file)) {
    return `<div class="cell missing">not captured</div>`
  }
  return `<div class="cell"><img src="file://${file}"/></div>`
}

function sheetHtml(screen: string, beforeDir: string, afterDir: string): string {
  const cols = THEMES.flatMap((t) => MODES.map((m) => ({ t, m })))
  const head = cols.map((c) => `<div class="head">${c.t}<span>${c.m}</span></div>`).join('')
  const before = cols.map((c) => cell(beforeDir, screen, c.t, c.m)).join('')
  const after = cols.map((c) => cell(afterDir, screen, c.t, c.m)).join('')
  return `<!doctype html><meta charset="utf-8"><style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #ffffff; font: 13px/1.3 -apple-system, "Segoe UI", sans-serif; color: #111; }
    h1 { margin: 20px 24px 4px; font-size: 22px; letter-spacing: -0.01em; white-space: nowrap; }
    p.sub { margin: 0 24px 16px; color: #666; white-space: nowrap; }
    .grid { display: grid; grid-template-columns: 92px repeat(${cols.length}, ${CELL_W}px); gap: 8px; padding: 0 24px 24px; width: max-content; }
    .head { font-weight: 700; text-transform: capitalize; padding-bottom: 4px; }
    .head span { display: block; font-weight: 400; color: #777; text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
    .rowlabel { display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; font-weight: 700; text-align: right; }
    .rowlabel.after { color: #0a7d55; }
    .cell { width: ${CELL_W}px; height: ${CELL_H}px; overflow: hidden; border: 1px solid #d9d9de; border-radius: 6px; background: #f3f3f5; }
    .cell img { width: 100%; display: block; }
    .cell.missing { display: flex; align-items: center; justify-content: center; color: #999; font-style: italic; }
    .spacer { grid-column: 1; }
  </style>
  <h1>${screen} — <code>master</code> vs <code>${BRANCH}</code></h1>
  <p class="sub">Every theme kit plus the no-kit platform default, light and dark. Top-anchored; cells are cropped to ${CELL_W}&times;${CELL_H}.</p>
  <div class="grid">
    <div class="spacer"></div>${head}
    <div class="rowlabel">before</div>${before}
    <div class="rowlabel after">after</div>${after}
  </div>`
}

async function main() {
  const [, , beforeDir, afterDir, outDir] = process.argv
  if (!beforeDir || !afterDir || !outDir) {
    console.error('Usage: npx tsx scripts/qa-contact-sheet.ts <beforeDir> <afterDir> <outDir>')
    process.exit(1)
  }
  mkdirSync(outDir, { recursive: true })

  const screens = [...new Set([...screensIn(beforeDir), ...screensIn(afterDir)])].sort()
  console.log(`[contact-sheet] ${screens.length} screens: ${screens.join(', ')}`)

  // The sheet has to be a real file:// document: Chromium refuses to load
  // file:// subresources into an about:blank page, which is what setContent
  // gives you, and every cell renders as a broken-image icon.
  const stage = mkdtempSync(path.join(tmpdir(), 'sheet764-'))

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 200, height: 200 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  try {
    for (const screen of screens) {
      const html = path.join(stage, `${screen}.html`)
      writeFileSync(html, sheetHtml(screen, beforeDir, afterDir))
      await page.goto(`file://${html}`, { waitUntil: 'load' })
      await page.waitForFunction(
        () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
        undefined,
        { timeout: 30_000 }
      )
      await page.waitForTimeout(300)
      const out = path.join(outDir, `${screen}.jpg`)
      await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 78 })
      console.log(`[contact-sheet] wrote ${out}`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[contact-sheet] FAILED', err)
  process.exit(1)
})
