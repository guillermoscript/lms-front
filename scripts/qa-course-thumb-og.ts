/**
 * One-off capture for #765 QA: the course share image (`/api/og?type=course`)
 * WITH a `thumbnail_url` set, since no seeded course has one. Companion to
 * scripts/qa-brand-outputs.ts, which captures the no-thumbnail course card.
 *
 * Usage: npx tsx scripts/qa-course-thumb-og.ts <pageUrl> <outPngPath>
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

async function main() {
  const [pageUrl, outPath] = process.argv.slice(2)
  if (!pageUrl || !outPath) {
    console.error('Usage: npx tsx scripts/qa-course-thumb-og.ts <pageUrl> <outPngPath>')
    process.exit(1)
  }
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' })
    const content = await page.locator('meta[property="og:image"]').first().getAttribute('content')
    if (!content) throw new Error('no og:image meta tag found')
    const imageUrl = new URL(content, new URL(pageUrl).origin).toString()
    const res = await ctx.request.get(imageUrl)
    if (!res.ok()) throw new Error(`GET ${imageUrl} -> ${res.status()}`)
    writeFileSync(outPath, await res.body())
    writeFileSync(outPath.replace(/\.png$/, '-url.txt'), `${pageUrl}\n${imageUrl}\n`)
    console.log('wrote', outPath, 'from', imageUrl)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('FAILED', err)
  process.exit(1)
})
