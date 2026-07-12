/**
 * Dev-only: serves the desktop wallet subscription test page.
 *
 * The page lives in public/wallet-subscribe.html, but proxy.ts + next-intl
 * redirect bare static paths to /en/… (breaking them). /api/* is exempt from
 * that rewrite, so we serve the same HTML from here to keep it same-origin
 * (the page's fetch to /api/payments/checkout needs the session cookie).
 *
 * Open: http://code-academy.lvh.me:3005/api/wallet-subscribe?planId=10006
 */

import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const runtime = 'nodejs'

export async function GET() {
  const html = readFileSync(join(process.cwd(), 'public', 'wallet-subscribe.html'), 'utf8')
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
