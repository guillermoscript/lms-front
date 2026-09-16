/**
 * Builds the PR's GIF for issue #764 surface 2: one school-facing screen,
 * cycling through every theme kit and both modes, before and after.
 *
 * Each frame is a labelled side-by-side of the `master` shot and the branch
 * shot for the same theme/mode, so the GIF shows the actual point of the
 * change — the storefront starts following the kit the school picked instead
 * of rendering the same near-black for everyone.
 *
 * Usage: npx tsx scripts/qa-theme-gif.ts <screen> <beforeDir> <afterDir> <outGif>
 *   e.g. npx tsx scripts/qa-theme-gif.ts course /tmp/before /tmp/after docs/qa/764b/course-themes.gif
 */

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const THEMES = ['estructura', 'andina', 'kodigo', 'luz', 'platform']
const MODES = ['light', 'dark']
const PANEL_W = 620
const PANEL_H = 700

function frameHtml(screen: string, theme: string, mode: string, beforeDir: string, afterDir: string): string {
  const src = (dir: string) => `file://${path.join(dir, `${screen}-${theme}-${mode}.png`)}`
  return `<!doctype html><meta charset="utf-8"><style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; width: ${PANEL_W * 2 + 48}px; background: #ffffff;
           font: 14px/1.3 -apple-system, "Segoe UI", sans-serif; color: #111; }
    header { display: flex; align-items: baseline; gap: 10px; padding: 14px 16px 10px; }
    header h1 { margin: 0; font-size: 17px; letter-spacing: -0.01em; }
    header .kit { font-weight: 700; text-transform: capitalize; }
    header .mode { color: #666; text-transform: uppercase; font-size: 11px; letter-spacing: .08em; }
    .row { display: grid; grid-template-columns: ${PANEL_W}px ${PANEL_W}px; gap: 16px; padding: 0 16px 16px; }
    .panel h2 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #777; }
    .panel.after h2 { color: #0a7d55; }
    .shot { width: ${PANEL_W}px; height: ${PANEL_H}px; overflow: hidden;
            border: 1px solid #d9d9de; border-radius: 8px; background: #f3f3f5; }
    .shot img { width: 100%; display: block; }
    .missing { display: flex; align-items: center; justify-content: center; color: #999; font-style: italic; }
  </style>
  <header>
    <h1>${screen}</h1>
    <span class="kit">${theme}</span>
    <span class="mode">${mode}</span>
  </header>
  <div class="row">
    <div class="panel"><h2>before — master</h2><div class="shot"><img src="${src(beforeDir)}"/></div></div>
    <div class="panel after"><h2>after — theme tokens</h2><div class="shot"><img src="${src(afterDir)}"/></div></div>
  </div>`
}

async function main() {
  const [, , screen, beforeDir, afterDir, outGif] = process.argv
  if (!screen || !beforeDir || !afterDir || !outGif) {
    console.error('Usage: npx tsx scripts/qa-theme-gif.ts <screen> <beforeDir> <afterDir> <outGif>')
    process.exit(1)
  }
  mkdirSync(path.dirname(outGif), { recursive: true })
  const frameDir = mkdtempSync(path.join(tmpdir(), 'gif764-'))

  const combos = THEMES.flatMap((t) => MODES.map((m) => ({ t, m }))).filter(
    (c) =>
      existsSync(path.join(beforeDir, `${screen}-${c.t}-${c.m}.png`)) &&
      existsSync(path.join(afterDir, `${screen}-${c.t}-${c.m}.png`))
  )
  if (combos.length === 0) throw new Error(`no before/after pairs found for screen "${screen}"`)

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: PANEL_W * 2 + 48, height: 200 } })
  try {
    for (const [i, c] of combos.entries()) {
      // A real file:// document, not setContent: Chromium will not load file://
      // subresources into an about:blank page, so every panel would be a
      // broken-image icon.
      const html = path.join(frameDir, `f${String(i).padStart(3, '0')}.html`)
      writeFileSync(html, frameHtml(screen, c.t, c.m, beforeDir, afterDir))
      await page.goto(`file://${html}`, { waitUntil: 'load' })
      await page.waitForFunction(
        () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
        undefined,
        { timeout: 30_000 }
      )
      const out = path.join(frameDir, `f${String(i).padStart(3, '0')}.png`)
      await page.screenshot({ path: out, fullPage: true })
    }
  } finally {
    await browser.close()
  }
  console.log(`[theme-gif] ${combos.length} frames in ${frameDir}`)

  // Two-pass palette so the brand hues survive the 256-colour quantisation.
  const palette = path.join(frameDir, 'palette.png')
  execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(frameDir, 'f%03d.png'),
    '-vf', 'scale=1100:-1:flags=lanczos,palettegen=stats_mode=diff', palette], { stdio: 'inherit' })
  execFileSync('ffmpeg', ['-y', '-framerate', '1', '-i', path.join(frameDir, 'f%03d.png'), '-i', palette,
    '-lavfi', 'scale=1100:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', outGif], { stdio: 'inherit' })
  console.log(`[theme-gif] wrote ${outGif}`)
}

main().catch((err) => {
  console.error('[theme-gif] FAILED', err)
  process.exit(1)
})
