/**
 * First-party analytics proxy.
 *
 * Everything the browser tracker sends goes through our own origin instead of
 * an analytics hostname, which is what keeps adblockers from eating 10–30% of
 * events. Same trick Sentry already plays here via `tunnelRoute: "/monitoring"`
 * in `next.config.ts`.
 *
 * ⚠️ `op` MUST stay in the `proxy.ts` matcher exclusion list. Without it every
 * event is intercepted by tenant/auth middleware and 307s into the
 * `/join-school` redirect — the #1 documented failure mode for this feature
 * (`docs/ANALYTICS_OPENPANEL.md` §3.1), and it presents as "no data" rather
 * than as an error.
 *
 * WHAT THE VENDOR HANDLER DOES
 *   GET  …/op1.js  → serves the tracker script
 *   POST …/track   → forwards to the collector at `apiUrl`
 *   anything else  → 404
 *
 * `createRouteHandler({ apiUrl })` points the *ingest* leg at our self-hosted
 * instance. The *script* leg is hardcoded to `https://openpanel.dev/op1.js` in
 * the vendor build and is NOT covered by `apiUrl`, so the override below exists
 * for the case where the self-hosted collector needs its own matching tracker
 * build. Unset, we serve the CDN script — still first-party to the browser,
 * because we fetch it server-side and re-serve it from this route.
 */

import { createRouteHandler } from '@openpanel/nextjs/server'

export const dynamic = 'force-dynamic'

const SCRIPT_PATH = '/op1.js'

const apiUrl = process.env.NEXT_PUBLIC_OPENPANEL_API_URL?.replace(/\/+$/, '')
const scriptOrigin = process.env.NEXT_PUBLIC_OPENPANEL_SCRIPT_ORIGIN?.replace(/\/+$/, '')

const openPanelHandler = apiUrl
  ? createRouteHandler({ apiUrl })
  : createRouteHandler()

async function serveSelfHostedScript(origin: string, request: Request): Promise<Response> {
  const requested = new URL(request.url)
  const target = new URL(SCRIPT_PATH, `${origin}/`)
  target.search = requested.search

  try {
    const upstream = await fetch(target, { next: { revalidate: 86400 } })
    if (!upstream.ok) return new Response(null, { status: 502 })

    return new Response(await upstream.text(), {
      headers: {
        'Content-Type': 'text/javascript',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
      },
    })
  } catch {
    // A missing tracker script degrades to "no client-side analytics". It must
    // never surface as a page error.
    return new Response(null, { status: 502 })
  }
}

async function handle(request: Request): Promise<Response> {
  // No credentials configured: the route does not exist. No outbound request,
  // no console noise, identical behaviour to before this feature landed.
  if (!process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID) {
    return new Response(null, { status: 404 })
  }

  const { pathname } = new URL(request.url)
  if (scriptOrigin && request.method === 'GET' && pathname.endsWith(SCRIPT_PATH)) {
    return serveSelfHostedScript(scriptOrigin, request)
  }

  return openPanelHandler(request)
}

export const GET = handle
export const POST = handle
