/**
 * A tiny provider stub that runs INSIDE the Playwright process and answers the
 * APP's outbound provider calls on loopback (the `PAYPAL_API_BASE` /
 * `BINANCE_PAY_API_BASE` seams). Same shape as the stubs in
 * paypal-settlement.spec.ts and binance-personal-settlement.spec.ts, factored
 * out so a spec can program it with one handler and read back every hit.
 *
 * Binds literally 127.0.0.1 (never `localhost`, which undici may resolve to ::1
 * first) on the port the base URL names; a busy port throws EADDRINUSE loudly.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'

export interface StubHit {
  method: string
  path: string
  headers: IncomingMessage['headers']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

export interface StubReply {
  status: number
  body: unknown
}

/** Return a reply, or `undefined` for a 404. */
export type StubHandler = (hit: StubHit) => StubReply | undefined

export interface LoopbackStub {
  hits: StubHit[]
  hitsOn(method: string, path: string): StubHit[]
  stop(): Promise<void>
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

export async function startLoopbackStub(base: string, handler: StubHandler): Promise<LoopbackStub> {
  const url = new URL(base)
  if (url.hostname !== '127.0.0.1') {
    throw new Error(`stub base must be http://127.0.0.1:<port> (got ${base})`)
  }
  if (!url.port) throw new Error(`stub base must carry an explicit port (got ${base})`)

  const hits: StubHit[] = []
  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '/').split('?')[0] || '/'
      const text = await readBody(req)
      let body: unknown = text
      try {
        body = text ? JSON.parse(text) : ''
      } catch {
        /* form-encoded bodies (OAuth) stay strings */
      }
      const hit: StubHit = { method: req.method ?? 'GET', path, headers: req.headers, body }
      hits.push(hit)
      let reply: StubReply | undefined
      try {
        reply = handler(hit)
      } catch (err) {
        reply = { status: 500, body: { error: err instanceof Error ? err.message : String(err) } }
      }
      const out = reply ?? { status: 404, body: { name: 'RESOURCE_NOT_FOUND', path } }
      res.writeHead(out.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out.body))
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(url.port), '127.0.0.1', resolve)
  })

  return {
    hits,
    hitsOn: (method, path) => hits.filter((h) => h.method === method && h.path === path),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
