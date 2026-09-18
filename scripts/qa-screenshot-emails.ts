/**
 * QA (#765): screenshots every rendered email HTML file (before + after) at
 * 600px wide, full page, into a PNG next to the HTML.
 */
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const ROOT = process.env.QA765_OUT ?? `${homedir()}/lms-765-qa`

function findHtmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...findHtmlFiles(full))
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

async function main() {
  const files = [
    ...findHtmlFiles(path.join(ROOT, 'before', 'emails')),
    ...findHtmlFiles(path.join(ROOT, 'after', 'emails')),
  ]
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 600, height: 800 } })
  const page = await ctx.newPage()
  for (const file of files) {
    const url = `file://${file}`
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(150)
    const pngPath = file.replace(/\.html$/, '.png')
    await page.screenshot({ path: pngPath, fullPage: true })
    console.log('shot', pngPath)
  }
  await browser.close()
}

main().catch((err) => {
  console.error('FAILED', err)
  process.exit(1)
})
