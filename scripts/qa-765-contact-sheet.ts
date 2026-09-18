/**
 * QA (#765) contact sheets — builds before|after (and multi-brand) grids for
 * emails, certificates and OG images into ~/lms-765-qa/sheets/.
 *
 * Same file:// staging trick as scripts/qa-contact-sheet.ts (Chromium refuses
 * file:// subresources on an about:blank page from setContent).
 *
 * Usage: npx tsx scripts/qa-765-contact-sheet.ts
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import path from 'node:path'

const ROOT = process.env.QA765_OUT ?? path.join(homedir(), 'lms-765-qa')
const OUT_DIR = path.join(ROOT, 'sheets')
const CELL_W = 300

interface Cell {
  label: string
  file: string
  height?: number
}
interface Row {
  label: string
  cells: Cell[]
}
interface Sheet {
  name: string
  title: string
  rows: Row[]
  cellH: number
}

function cellHtml(cell: Cell, cellH: number): string {
  if (!existsSync(cell.file)) {
    return `<div class="cell missing" style="width:${CELL_W}px;height:${cellH}px">not captured<br/><span class="path">${cell.file}</span></div>`
  }
  return `<div class="cell" style="width:${CELL_W}px;height:${cellH}px"><img src="file://${cell.file}"/></div>`
}

function sheetHtml(sheet: Sheet): string {
  const cols = sheet.rows[0]?.cells.length ?? 0
  const head = sheet.rows[0]?.cells.map((c) => `<div class="head">${c.label}</div>`).join('') ?? ''
  const body = sheet.rows
    .map(
      (row) =>
        `<div class="rowlabel">${row.label}</div>${row.cells
          .map((c) => cellHtml(c, sheet.cellH))
          .join('')}`
    )
    .join('')
  return `<!doctype html><meta charset="utf-8"><style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #ffffff; font: 13px/1.3 -apple-system, "Segoe UI", sans-serif; color: #111; }
    h1 { margin: 20px 24px 4px; font-size: 20px; letter-spacing: -0.01em; }
    .grid { display: grid; grid-template-columns: 120px repeat(${cols}, ${CELL_W}px); gap: 8px; padding: 0 24px 24px; width: max-content; }
    .head { font-weight: 700; padding-bottom: 4px; text-align: center; }
    .rowlabel { display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; font-weight: 700; text-align: right; }
    .cell { overflow: hidden; border: 1px solid #d9d9de; border-radius: 6px; background: #f3f3f5; }
    .cell img { width: 100%; display: block; }
    .cell.missing { display: flex; flex-direction: column; align-items: center; justify-content: center; color: #999; font-style: italic; text-align: center; padding: 8px; font-size: 10px; }
    .cell.missing .path { font-family: monospace; font-size: 9px; word-break: break-all; margin-top: 6px; }
  </style>
  <h1>${sheet.title}</h1>
  <div class="grid">${head ? `<div></div>${head}` : ''}${body}</div>`
}

const B = path.join(ROOT, 'before', 'app')
const A = path.join(ROOT, 'after', 'app')
const BE = path.join(ROOT, 'before', 'emails')
const AE = path.join(ROOT, 'after', 'emails')

const EMAIL_TEMPLATES = [
  'enrollment-confirmed',
  'invitation',
  'joined-school',
  'certificate-issued',
  'course-removed',
  'payment-instructions',
  'daily-digest',
  'streak-nudge',
]

function emailSheet(name: string): Sheet {
  return {
    name: `email-${name}`,
    title: `Email — ${name} — before vs Andina / Kódigo / platform`,
    cellH: 500,
    rows: [
      {
        label: '',
        cells: [
          { label: 'before (hardcoded blue)', file: path.join(BE, `${name}.png`) },
          { label: 'Andina / Verde andino', file: path.join(AE, 'andina', `${name}.png`) },
          { label: 'Kódigo / Amarillo', file: path.join(AE, 'kodigo', `${name}.png`) },
          { label: 'platform (no theme)', file: path.join(AE, 'platform', `${name}.png`) },
        ],
      },
    ],
  }
}

function certSheet(): Sheet {
  return {
    name: 'certificates',
    title: 'Certificates — before vs after — default (school-branded) vs code-academy (custom template)',
    cellH: 420,
    rows: [
      {
        label: 'HTML view',
        cells: [
          { label: '', file: path.join(B, 'cert-html-view-default.png') },
          { label: '', file: path.join(A, 'cert-html-view-default.png') },
          { label: '', file: path.join(B, 'cert-html-view-code-academy.png') },
          { label: '', file: path.join(A, 'cert-html-view-code-academy.png') },
        ],
      },
      {
        label: 'PDF (page 1)',
        cells: [
          { label: '', file: path.join(B, 'cert-pdf-default.png') },
          { label: '', file: path.join(A, 'cert-pdf-default.png') },
          { label: '', file: path.join(B, 'cert-pdf-code-academy.png') },
          { label: '', file: path.join(A, 'cert-pdf-code-academy.png') },
        ],
      },
      {
        label: 'Verify page',
        cells: [
          { label: '', file: path.join(B, 'verify-page-default.png') },
          { label: '', file: path.join(A, 'verify-page-default.png') },
          { label: '', file: path.join(B, 'verify-page-code-academy.png') },
          { label: '', file: path.join(A, 'verify-page-code-academy.png') },
        ],
      },
      {
        label: 'Editor preview',
        cells: [
          { label: '', file: path.join(B, 'cert-template-editor-preview.png') },
          { label: '', file: path.join(A, 'cert-template-editor-preview.png') },
          { label: '', file: path.join(B, 'cert-template-editor-preview.png') },
          { label: '', file: path.join(A, 'cert-template-editor-preview.png') },
        ],
      },
    ],
  }
}

function certSheetHead(): string {
  return ''
}

function ogSheet(): Sheet {
  return {
    name: 'og',
    title: 'OG share images — before vs after',
    cellH: 260,
    rows: [
      {
        label: 'generic (default)',
        cells: [
          { label: 'before', file: path.join(B, 'og-generic-default.png') },
          { label: 'after', file: path.join(A, 'og-generic-default.png') },
        ],
      },
      {
        label: 'generic (code-academy)',
        cells: [
          { label: 'before', file: path.join(B, 'og-generic-code-academy.png') },
          { label: 'after', file: path.join(A, 'og-generic-code-academy.png') },
        ],
      },
      {
        label: 'certificate (default)',
        cells: [
          { label: 'before', file: path.join(B, 'og-certificate-default.png') },
          { label: 'after', file: path.join(A, 'og-certificate-default.png') },
        ],
      },
      {
        label: 'certificate (code-academy)',
        cells: [
          { label: 'before', file: path.join(B, 'og-certificate-code-academy.png') },
          { label: 'after', file: path.join(A, 'og-certificate-code-academy.png') },
        ],
      },
      {
        label: 'course (no thumb)',
        cells: [
          { label: 'before', file: path.join(B, 'og-course-1002.png') },
          { label: 'after', file: path.join(A, 'og-course-1002.png') },
        ],
      },
      {
        label: 'course (thumb) — after only',
        cells: [{ label: 'after', file: path.join(A, 'og-course-1002-thumb.png') }],
      },
    ],
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const sheets: Sheet[] = [...EMAIL_TEMPLATES.map(emailSheet), certSheet(), ogSheet()]

  const stage = mkdtempSync(path.join(tmpdir(), 'sheet765-'))
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 200, height: 200 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  try {
    for (const sheet of sheets) {
      const html = path.join(stage, `${sheet.name}.html`)
      writeFileSync(html, sheetHtml(sheet))
      await page.goto(`file://${html}`, { waitUntil: 'load' })
      await page
        .waitForFunction(
          () => Array.from(document.images).every((img) => img.complete),
          undefined,
          { timeout: 30_000 }
        )
        .catch(() => {})
      await page.waitForTimeout(250)
      const out = path.join(OUT_DIR, `${sheet.name}.jpg`)
      await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 82 })
      console.log('[qa-765-sheet] wrote', out)
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[qa-765-sheet] FAILED', err)
  process.exit(1)
})
